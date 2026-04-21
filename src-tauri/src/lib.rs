use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use std::{
    collections::HashMap,
    env,
    net::SocketAddr,
    sync::{Arc, Mutex},
};

use futures_channel::mpsc::{unbounded, UnboundedSender};
use futures_util::{future, pin_mut, stream::TryStreamExt, StreamExt};

use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::protocol::Message;

type Tx = UnboundedSender<Message>;
type PeerMap = Arc<Mutex<HashMap<SocketAddr, Tx>>>;


#[derive(Debug, Deserialize, Serialize, Clone)]
struct ExternalData {
   message: String,
   #[serde(flatten)]
   extra: serde_json::Value,
}

struct AppState {
   app_handle: AppHandle,
}
#[get("/")]
async fn hello() -> impl Responder {
   HttpResponse::Ok().body("Hello world!")
}

async fn handle_connection(peer_map: PeerMap, raw_stream: TcpStream, addr: SocketAddr) {
    println!("Incoming TCP connection from: {}", addr);

    let ws_stream = tokio_tungstenite::accept_async(raw_stream)
        .await
        .expect("Error during the websocket handshake occurred");
    println!("WebSocket connection established: {}", addr);

    // Insert the write part of this peer to the peer map.
    let (tx, rx) = unbounded();
    peer_map.lock().unwrap().insert(addr, tx);

    let (outgoing, incoming) = ws_stream.split();

    let broadcast_incoming = incoming.try_for_each(|msg| {
        println!("Received a message from {}: {}", addr, msg.to_text().unwrap());
        println!("here");
        future::ok(())
        
    });

    let receive_from_others = rx.map(Ok).forward(outgoing);

    pin_mut!(broadcast_incoming, receive_from_others);
    future::select(broadcast_incoming, receive_from_others).await;

    println!("{} disconnected", &addr);
    peer_map.lock().unwrap().remove(&addr);
}

async fn setup_server(_app: AppHandle) {
  // Do your async setup here instead
    println!("I run in the background!");
    let state = PeerMap::new(Mutex::new(HashMap::new()));
    let addr = env::args().nth(1).unwrap_or_else(|| "127.0.0.1:8080".to_string());
    // Create the event loop and TCP listener we'll accept connections on.
    let try_socket = TcpListener::bind(&addr).await;
    let listener = try_socket.expect("Failed to bind");
    println!("Listening on: {}", addr);

    // Let's spawn the handling of each connection in a separate task.
    while let Ok((stream, addr)) = listener.accept().await {
         tokio::spawn(handle_connection(state.clone(), stream, addr));
    }

}



#[post("/send")]
async fn receive_data(
   data: web::Json<serde_json::Value>,
   state: web::Data<Mutex<AppState>>,
) -> impl Responder {
   let state = state.lock().unwrap();
   match state.app_handle.emit("external-data", &data.into_inner()) {
       Ok(_) => HttpResponse::Ok().json(serde_json::json!({
           "status": "ok",
           "detail": "Data forwarded to frontend"
       })),
       Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
           "status": "error",
           "detail": format!("Failed to emit event: {}", e)
       })),
   }
}
#[tauri::command]
fn greet(name: &str) -> String {
   format!("Hello, {}! You've been greeted from Rust!", name)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
   tauri::Builder::default()
       .plugin(tauri_plugin_process::init())
       .plugin(tauri_plugin_updater::Builder::new().build())
       .plugin(tauri_plugin_notification::init())
       .plugin(tauri_plugin_opener::init())
       .plugin(tauri_plugin_serialplugin::init())
       .plugin(tauri_plugin_http::init())
       .invoke_handler(tauri::generate_handler![greet])
       .setup(|app| {
           let app_handle = app.handle().clone();
        //    tauri::async_runtime::block_on(setup_server(app.handle().clone()));
           std::thread::spawn(move || {
               let rt = actix_web::rt::System::new();
               rt.block_on(async {
                   let shared_state = web::Data::new(Mutex::new(AppState {
                       app_handle,
                   }));
                   HttpServer::new(move || {
                       App::new()
                           .app_data(shared_state.clone())
                           .service(hello)
                           .service(receive_data)
                   })
                   .bind(("0.0.0.0", 8080))
                   .expect("Failed to bind address")
                   .run()
                   .await
                   .expect("Server failed");
               });
           });
           Ok(())
       })
       .run(tauri::generate_context!())
       .expect("error while running tauri application");
}