import { SerialPort } from "tauri-plugin-serialplugin";
import { sendNotification } from "@tauri-apps/plugin-notification";
export const serial = $state({
    connected: false,
    latest: "",      // holds the most recent full line
    port: null as SerialPort | null,
    latest_json: {}
});

export const temps = $state({
    controllers: [
        { current: 25, target: 50 , enable: false },
        { current: 27, target: 60 , enable: false },
        { current: 29, target: 55 , enable: false },
        { current: 31, target: 65 , enable: false }
    ]
});

export const force = $state({
    current: 0
});



let buffer = "";
export async function connect(path: string) {
    serial.port = new SerialPort({ path, baudRate: 115200, timeout: 100 });
    try {
        await serial.port.open();
        serial.connected = true;
        await serial.port.startListening();
        serial.port.listen((data: Uint8Array | string) => {
            buffer += typeof data === "string" ? data : new TextDecoder().decode(data);
            let idx: number;
            while ((idx = buffer.indexOf("\n")) !== -1) {
                serial.latest = buffer.slice(0, idx).replace(/\r$/, "");
                try {
                    serial.latest_json = JSON.parse(serial.latest);
                    // : {"sensors":[988.7921,988.7921,988.7921,988.7921],"heaters":[200,60,60,60],"enable":[false,false,false,false],"force":232.2419}
                    temps.controllers.forEach((controller, index) => {
                        controller.current = serial.latest_json.sensors[index];
                        controller.target = serial.latest_json.heaters[index];
                        controller.enable = serial.latest_json.enable[index];
                    });
                    force.current = serial.latest_json.force;
                } catch (error) {
                    console.error(`Failed to parse JSON: ${error}` + ` | Data: ${serial.latest}`);
                    
                }
                buffer = buffer.slice(idx + 1);
            }
        });
    } catch (e) {
        throw new Error(`Failed to open port: ${e}`);
    }
    serial.port.disconnected(() => {
        sendNotification({ title: "Afterburner", body: "Serial Disconnected" });
        serial.connected = false;
    });
}

export async function sendCommand(command: string) {
    if (!serial.port || !serial.connected) {
        throw new Error("Serial port is not connected");
    }
    try {
        await serial.port.write(`${command}\n`);
        console.debug(`Sent command: ${command}`);
    } catch (error) {
        console.error(`Failed to send command: ${error}`);
        throw error;
    }
}

//  {"heater": 0, "enable": true}
export async function setHeater(heater: number, enable: boolean) {
    if (!serial.port || !serial.connected) {
        throw new Error("Serial port is not connected");
    }
    const command = JSON.stringify({ heater, enable });
    try {
        await serial.port.write(`${command}\n`);
        console.debug(`Set heater ${heater} to ${enable}`);
    } catch (error) {
        console.error(`Failed to set heater: ${error}`);
        throw error;
    }
}
//// {"heater": 0, "set_temp": 200.0}
export async function setTemperature(heater: number, set_temp: number) {
    if (!serial.port || !serial.connected) {
        throw new Error("Serial port is not connected");
    }
    const command = JSON.stringify({ heater, set_temp });
    try {
        await serial.port.write(`${command}\n`);
        console.debug(`Set heater ${heater} temperature to ${set_temp}`);
    } catch (error) {
        console.error(`Failed to set temperature: ${error}`);
        throw error;
    }
}

export async function disconnect() {
    if (serial.port) {
        await serial.port.cancelListen();
        await serial.port.close();
        serial.connected = false;
    }
}
