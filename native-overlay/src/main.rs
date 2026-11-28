mod render;
mod wayland_sub;
mod x11_child;

use std::sync::Arc;

use render::Shared;

pub const HUD: &str = include_str!("hud.html");

pub struct Options {
    pub webview: bool,
    pub seconds: u64,
    pub width: u32,
    pub height: u32,
}

pub fn ipc(shared: Arc<Shared>) -> impl Fn(wry::http::Request<String>) + 'static {
    move |req| {
        let body = req.body();
        let Ok(msg) = serde_json::from_str::<serde_json::Value>(body) else {
            return;
        };
        match msg["kind"].as_str() {
            Some("world") => {
                let (x, y) = (msg["x"].as_f64().unwrap_or(0.0), msg["y"].as_f64().unwrap_or(0.0));
                shared.log(&format!("INPUT world-side click x={x} y={y} button={}", msg["button"]));
                shared.world_click(x as f32, y as f32);
            }
            Some("hud") => shared.log(&format!("INPUT hud button {}", msg["id"])),
            Some("dpr") => shared.log(&format!("HUD dpr={} view={}x{}", msg["dpr"], msg["w"], msg["h"])),
            _ => shared.log(&format!("IPC {body}")),
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let flag = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    let size = flag("--size").unwrap_or_else(|| "1280x720".into());
    let (w, h) = size.split_once('x').expect("--size WxH");
    let opts = Options {
        webview: !args.iter().any(|a| a == "--no-webview"),
        seconds: flag("--seconds").map(|s| s.parse().unwrap()).unwrap_or(30),
        width: w.parse().unwrap(),
        height: h.parse().unwrap(),
    };
    match args.get(1).map(String::as_str) {
        Some("wayland") => wayland_sub::run(opts),
        Some("x11") => x11_child::run(opts),
        _ => {
            eprintln!("usage: native-overlay wayland|x11 [--no-webview] [--seconds N] [--size WxH]");
            std::process::exit(2);
        }
    }
}
