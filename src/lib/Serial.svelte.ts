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
export const pid_status_data = $state({ 
    type: "", 
    target_temperature: 0, 
    heater_enabled: false,
    pwm_duty: 0
});

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
                            
                            // Handle error messages
                            if (serial.latest_json.type === "error") {
                                const errorMessage = serial.latest_json.message || "Unknown error";
                                sendNotification({ 
                                    title: "⚠️ Afterburner Error", 
                                    body: errorMessage 
                                });
                                console.error(`System error: ${errorMessage}`);
                            }
                            
                            // Handle power meter data
                            if ("voltage_mv" in serial.latest_json) {
                                power_meter_data.voltage_mv = serial.latest_json.voltage_mv;
                                power_meter_data.current_ma = serial.latest_json.current_ma;
                                power_meter_data.power_mw = serial.latest_json.power_mw;
                            }
                            
                            // Handle temperature data
                            if ("temperature" in serial.latest_json) {
                                temperature_data.temperature = serial.latest_json.temperature;
                            }
                            
                            // Handle loadcell data
                            if ("loadcell" in serial.latest_json) {
                                loadcell_data.loadcell = serial.latest_json.loadcell;
                            }
                            
                            // Handle PID status
                            if (serial.latest_json.type === "pid_status") {
                                pid_status_data.type = serial.latest_json.type;
                                pid_status_data.target_temperature = serial.latest_json.target_temperature;
                                pid_status_data.heater_enabled = serial.latest_json.heater_enabled;
                                pid_status_data.pwm_duty = serial.latest_json.pwm_duty;
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

// ==================== Command Functions ====================

/**
 * Set the target temperature for the PID controller
 * @param temperature Target temperature in °C
 */
export async function setTargetTemperature(temperature: number) {
    const command = {
        type: "set_target_temperature",
        value: temperature
    };
    await sendCommand(JSON.stringify(command));
}

/**
 * Enable or disable the heater
 * @param enabled true to enable heater, false to disable
 */
export async function enableHeater(enabled: boolean) {
    const command = {
        type: "enable_heater",
        value: enabled
    };
    await sendCommand(JSON.stringify(command));
}

/**
 * Convenience function to enable the heater
 */
export async function turnHeaterOn() {
    await enableHeater(true);
}

/**
 * Convenience function to disable the heater
 */
export async function turnHeaterOff() {
    await enableHeater(false);
}

/**
 * Set target temperature and enable heater in one call
 * @param temperature Target temperature in °C
 */
export async function setTemperatureAndEnable(temperature: number) {
    await setTargetTemperature(temperature);
    // Small delay to ensure temperature is set before enabling
    await new Promise(resolve => setTimeout(resolve, 50));
    await enableHeater(true);
}

export async function disconnect() {
    if (!serial.port) {
        return;
    }
    
    try {
        if (unlistenDisconnected) {
            unlistenDisconnected();
            unlistenDisconnected = null;
        }
        
        await serial.port.cancelListen();
        await serial.port.close();
        
        serial.connected = false;
        buffer = "";
        
    } catch (error) {
        console.error(`Error during disconnect: ${error}`);
        serial.connected = false;
        buffer = "";
    }
}