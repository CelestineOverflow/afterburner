#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
   )]
   use serialport::SerialPort;
   use std::{
    io::Read,
    sync::{
      atomic::{AtomicBool, Ordering},
      Arc, Mutex,
    },
    thread,
    time::Duration,
   };
   use tauri::{AppHandle, Manager, State};
   /// Shared between commands & the reader thread
   struct SerialState {
    port: Option<Box<dyn SerialPort + Send>>,
    running: Arc<AtomicBool>,
   }
   impl Default for SerialState {
    fn default() -> Self {
      Self {
        port: None,
        running: Arc::new(AtomicBool::new(false)),
      }
    }
   }
   /// 1. List all available serial ports on the system
   #[tauri::command]
   fn list_ports() -> Result<Vec<String>, String> {
    serialport::available_ports()
      .map_err(|e| e.to_string())
      .map(|ports| ports.into_iter().map(|p| p.port_name).collect())
   }
   /// 2. Connect & start background reader thread
   #[tauri::command]
   fn connect(
    app: AppHandle,
    state: State<Mutex<SerialState>>,
    port_name: String,
    baud_rate: u32,
   ) -> Result<(), String> {
    let mut st = state.lock().unwrap();
    if st.running.load(Ordering::SeqCst) {
      return Err("Already connected".into());
    }
    // Try to open
    let mut port = serialport::new(port_name.clone(), baud_rate)
      .timeout(Duration::from_millis(100))
      .open()
      .map_err(|e| format!("Failed to open {}: {}", port_name, e))?;
    // Mark running
    st.running.store(true, Ordering::SeqCst);
    let running_flag = st.running.clone();
    // Spawn reader thread
    thread::spawn(move || {
      let mut buffer = [0u8; 1024];
      while running_flag.load(Ordering::SeqCst) {
        match port.read(&mut buffer) {
          Ok(n) if n > 0 => {
            let chunk = buffer[..n].to_vec();
            // emit raw bytes; frontend will get an ArrayBuffer
            app.emit_all("serial-port-data", chunk).ok();
          }
          // timed out / no data: just loop
          Ok(_) | Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => continue,
          Err(_) => break,
        }
      }
    });
    // Store port for writes & for drop on disconnect
    st.port = Some(port);
    Ok(())
   }
   /// 3. Disconnect: stop reader + close port
   #[tauri::command]
   fn disconnect(state: State<Mutex<SerialState>>) -> Result<(), String> {
    let mut st = state.lock().unwrap();
    if !st.running.load(Ordering::SeqCst) {
      return Err("Not connected".into());
    }
    st.running.store(false, Ordering::SeqCst);
    // dropping port closes it
    st.port.take();
    Ok(())
   }
   /// 4. Write bytes (or UTF-8 strings) to the open port
   #[tauri::command]
   fn write_port(
    state: State<Mutex<SerialState>>,
    data: Vec<u8>,
   ) -> Result<(), String> {
    let mut st = state.lock().unwrap();
    if let Some(ref mut port) = st.port {
      port
        .write_all(&data)
        .map_err(|e| format!("Write failed: {}", e))
    } else {
      Err("No port open".into())
    }
   }
   fn main() {
    tauri::Builder::default()
      .manage(Mutex::new(SerialState::default()))
      .invoke_handler(tauri::generate_handler![
        list_ports,
        connect,
        disconnect,
        write_port
      ])
      .run(tauri::generate_context!())
      .expect("error while running tauri application");
   }