import { SerialPort } from "tauri-plugin-serialplugin";
import { sendNotification } from "@tauri-apps/plugin-notification";

export const serial = $state({
    connected: false,
    latest: "",
    port: null as SerialPort | null,
    latest_json: {}
});

let buffer = "";
let unlistenDisconnected: (() => void) | null = null;

export const power_meter_data = $state({ voltage_mv: 0, current_ma: 0, power_mw: 0 });
export const temperature_data = $state({ temperature: 0.0 });
export const loadcell_data = $state({ loadcell: 0 });

export async function connect(path: string) {
    serial.port = new SerialPort({ path, baudRate: 115200, timeout: 100 });
    
    try {
        await serial.port.open();
        serial.connected = true;
        await serial.port.startListening();
        
        serial.port.listen((data: Uint8Array | string) => {
            try {
                buffer += typeof data === "string" ? data : new TextDecoder().decode(data);
                let idx: number;
                
                while ((idx = buffer.indexOf("\n")) !== -1) {
                    serial.latest = buffer.slice(0, idx).replace(/\r$/, "");
                    
                    if (serial.latest.trim().startsWith("{") || serial.latest.trim().startsWith("[")) {
                        try {
                            serial.latest_json = JSON.parse(serial.latest);
                            
                            if ("voltage_mv" in serial.latest_json) {
                                power_meter_data.voltage_mv = serial.latest_json.voltage_mv;
                                power_meter_data.current_ma = serial.latest_json.current_ma;
                                power_meter_data.power_mw = serial.latest_json.power_mw;
                            }
                            
                            if ("temperature" in serial.latest_json) {
                                temperature_data.temperature = serial.latest_json.temperature;
                            }
                            
                            if ("loadcell" in serial.latest_json) {
                                loadcell_data.loadcell = serial.latest_json.loadcell;
                            }
                        } catch (error) {
                            console.error(`Failed to parse JSON: ${error} | Data: ${serial.latest}`);
                        }
                    } else {
                        console.debug(`Non-JSON message: ${serial.latest}`);
                    }
                    
                    buffer = buffer.slice(idx + 1);
                }
            } catch (error) {
                console.error(`Serial listener error: ${error}`);
            }
        });
        
        // AWAIT the disconnected() call to get the actual unlisten function
        unlistenDisconnected = await serial.port.disconnected(() => {
            sendNotification({ title: "Afterburner", body: "Serial Disconnected" });
            serial.connected = false;
            buffer = "";
            unlistenDisconnected = null;
        });
        
    } catch (e) {
        throw new Error(`Failed to open port: ${e}`);
    }
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

export async function disconnect() {
    if (!serial.port) {
        return;
    }
    
    try {
        // Unregister the disconnected listener first
        if (unlistenDisconnected) {
            unlistenDisconnected();
            unlistenDisconnected = null;
        }
        
        // Stop listening for data
        await serial.port.cancelListen();
        
        // Close the port
        await serial.port.close();
        
        // Update state
        serial.connected = false;
        buffer = "";
        
    } catch (error) {
        console.error(`Error during disconnect: ${error}`);
        // Even if there's an error, update the state
        serial.connected = false;
        buffer = "";
    }
}