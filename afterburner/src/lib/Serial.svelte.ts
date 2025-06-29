import { SerialPort } from "tauri-plugin-serialplugin";
// import { state, effect } from "svelte";
import { sendNotification } from "@tauri-apps/plugin-notification";
export const serial = $state({
    connected: false,
    latest: "",      // holds the most recent full line
    port: null as SerialPort | null,
    latest_json : {}
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
                try{
                    serial.latest_json = JSON.parse(serial.latest);
                }catch (error) {
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
export async function disconnect() {
    if (serial.port) {
        await serial.port.cancelListen();
        await serial.port.close();
        serial.connected = false;
    }
}

export const temps = $state({
	controllers: [
		{ current: 25, target: 50 },
		{ current: 27, target: 60 },
		{ current: 29, target: 55 },
		{ current: 31, target: 65 }
	]
});

// mock up data update function on temps
export function updateTemps() {
    temps.controllers.forEach((controller, index) => {
        controller.current += (Math.random() - 0.5) * 2; // Randomly change current temperature
        controller.target += (Math.random() - 0.5) * 2; // Randomly change target temperature
    });
}