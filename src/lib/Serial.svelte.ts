import { sendNotification } from "@tauri-apps/plugin-notification";
import { io, type Socket } from "socket.io-client";

// ---- config ----
const SERVER_URL = "http://localhost:3000";

// ---- types ----
type PortInfo = {
    path: string;
    manufacturer: string | null;
    serialNumber: string | null;
    vendorId: string | null;
    productId: string | null;
};

type SerialStateMsg = {
    connected: boolean;
    path: string | null;
    baudRate: number | null;
    error?: string;
};

type Ack = { ok: boolean; error?: string };

// ---- $state stores (same shape as before — components reading these don't change) ----
export const serial = $state({
    connected: false,
    latest: "",
    latest_json: {} as any,
    path: null as string | null,
    baudRate: null as number | null,
});

export const power_meter_data = $state({ voltage_mv: 0, current_ma: 0, power_mw: 0 });
export const temperature_data = $state({ temperature: 0.0 });
export const loadcell_data = $state({ loadcell: 0 });
export const pid_values = $state({ p: 0.0, d: 0.0, i: 0.0 });
export const pid_status_data = $state({
    type: "",
    target_temperature: 0,
    heater_enabled: false,
    pwm_duty: 0,
});
export const firmware_data = $state({ version: "", idf_version: "", build_time: "", build_date: "", project_name: "" });


export const port_list = $state({ ports: [] as PortInfo[] });

// ---- socket.io connection ----
const socket: Socket = io(SERVER_URL, { autoConnect: true });

socket.on("connect", () => {
    console.log(`socket connected: ${socket.id}`);
});

socket.on("disconnect", (reason) => {
    console.log(`socket disconnected: ${reason}`);
    serial.connected = false;
});

socket.on("serial-state", (state: SerialStateMsg) => {
    const wasConnected = serial.connected;
    serial.connected = state.connected;
    serial.path = state.path;
    serial.baudRate = state.baudRate;

    if (wasConnected && !state.connected) {
        sendNotification({ title: "Afterburner", body: "Serial Disconnected" });
    }
    if (state.error) {
        console.error(`serial error from server: ${state.error}`);
    }
});

socket.on("serial-line", (payload: any) => {
    serial.latest_json = payload;
    if (typeof payload?.raw === "string") {
        serial.latest = payload.raw;
    } else {
        try {
            serial.latest = JSON.stringify(payload);
        } catch {
            serial.latest = "";
        }
    }
});

socket.on("power-meter-data", (d: { voltage_mv: number; current_ma: number; power_mw: number }) => {
    power_meter_data.voltage_mv = d.voltage_mv;
    power_meter_data.current_ma = d.current_ma;
    power_meter_data.power_mw = d.power_mw;
});

socket.on("temperature-data", (d: { temperature: number }) => {
    temperature_data.temperature = d.temperature;
});

socket.on("firmware-info", (d: typeof firmware_data) => {
    console.log("Received firmware data:", d);
    firmware_data.version = d.version;
    firmware_data.idf_version = d.idf_version;
    firmware_data.build_time = d.build_time;
    firmware_data.build_date = d.build_date;
    firmware_data.project_name = d.project_name;
}
);

socket.on("loadcell-data", (d: { loadcell: number }) => {
    loadcell_data.loadcell = d.loadcell;
});

socket.on("pid-values", (d: { p: number; i: number; d: number }) => {
    pid_values.p = d.p;
    pid_values.i = d.i;
    pid_values.d = d.d;
});

socket.on("pid-status", (d: typeof pid_status_data) => {
    pid_status_data.type = d.type;
    pid_status_data.target_temperature = d.target_temperature;
    pid_status_data.heater_enabled = d.heater_enabled;
    pid_status_data.pwm_duty = d.pwm_duty;
});

socket.on("error-notification", (n: { title: string; body: string }) => {
    sendNotification({ title: n.title, body: n.body });
    console.error(`Device error: ${n.body}`);
});

socket.on("port-list", (ports: PortInfo[]) => {
    port_list.ports = ports;
});

// ---- port discovery ----
export function subscribePortList() {
    socket.emit("subscribe-list-port");
}

export function unsubscribePortList() {
    socket.emit("unsubscribe-list-port");
}

// ---- connection control ----
export async function connect(path: string, baudRate = 115200) {
    if (!socket.connected) {
        await new Promise<void>((resolve) => {
            if (socket.connected) return resolve();
            socket.once("connect", () => resolve());
        });
    }
    socket.emit("connect-serial", { path, baudRate });
}

export async function disconnect() {
    socket.emit("disconnect-serial");
}

// ---- typed emit helper ----
// emits a named event with one argument and waits for the server's ack.
function emitWithAck(event: string, value?: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!serial.connected) {
            return reject(new Error("Serial port is not connected"));
        }
        socket.emit(event, value, (ack: Ack | undefined) => {
            if (ack?.ok) resolve();
            else reject(new Error(ack?.error ?? "Unknown error"));
        });
    });
}

// ==================== Command Functions ====================
// Same names and signatures as the previous file. Each one is now a single
// typed emit — the server owns the device-protocol shape.

/**
 * Set the target temperature for the PID controller
 * @param temperature Target temperature in °C
 */
export async function setTargetTemperature(temperature: number) {
    await emitWithAck("set-target-temperature", temperature);
}

/**
 * Set the p factor for the PID controller
 */
export async function setP(p: number) {
    await emitWithAck("set-p", p);
}

/**
 * Set the i factor for the PID controller
 */
export async function setI(I: number) {
    await emitWithAck("set-i", I);
}

/**
 * Set the D factor for the PID controller
 */
export async function setD(D: number) {
    await emitWithAck("set-d", D);
}

/**
 * Override the force-sensor gate so the heater can run regardless of force reading
 */
export async function override_force(isActive: boolean) {
    await emitWithAck("override-force", isActive);
}

/**
 * Enable or disable the heater
 */
export async function enableHeater(enabled: boolean) {
    await emitWithAck("enable-heater", enabled);
}

/**
 * Tare / zero the load cell
 */
export async function setZeroPoint() {
    await emitWithAck("set-zero-point");
}

export async function setMultiplier(current_force: number) {
    await emitWithAck("set-multiplier", current_force);
}

export async function turnHeaterOn() {
    await enableHeater(true);
}

export async function turnHeaterOff() {
    await enableHeater(false);
}

/**
 * Set target temperature and enable heater in one call
 */
export async function setTemperatureAndEnable(temperature: number) {
    await setTargetTemperature(temperature);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await enableHeater(true);
}
