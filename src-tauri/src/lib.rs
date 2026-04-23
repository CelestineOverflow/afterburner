use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, RunEvent};
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

use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

type Tx = UnboundedSender<Message>;
type PeerMap = Arc<Mutex<HashMap<SocketAddr, Tx>>>;

struct SidecarState(Mutex<Option<CommandChild>>);

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
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            // actix server (unchanged)
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let rt = actix_web::rt::System::new();
                rt.block_on(async {
                    let shared_state = web::Data::new(Mutex::new(AppState { app_handle }));
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

            // node sidecar — just spawn it, no args
            let (mut rx, child) = app.shell().sidecar("sidecar-server")?.spawn()?;
            app.manage(SidecarState(Mutex::new(Some(child))));

            tauri::async_runtime::spawn(async move {
                while let Some(ev) = rx.recv().await {
                    match ev {
                        CommandEvent::Stdout(b) | CommandEvent::Stderr(b) => {
                            eprintln!("[sidecar] {}", String::from_utf8_lossy(&b));
                        }
                        CommandEvent::Terminated(t) => {
                            eprintln!("[sidecar] exited: {:?}", t);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                if let Some(state) = app.try_state::<SidecarState>() {
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}