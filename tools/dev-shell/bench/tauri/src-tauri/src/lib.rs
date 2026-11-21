use tauri::{WebviewUrl, WebviewWindowBuilder};

fn env_or(name: &str, fallback: &str) -> String {
  std::env::var(name).unwrap_or_else(|_| fallback.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      let url = env_or("SPIKE_URL", "http://127.0.0.1:5173").parse()?;
      let width: f64 = env_or("F4X_BENCH_WIDTH", "1600").parse()?;
      let height: f64 = env_or("F4X_BENCH_HEIGHT", "1000").parse()?;
      let mut window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("Fantasia4x — Tauri / WebKitGTK")
        .user_agent("Fantasia4xShell Tauri (WebKitGTK)")
        .inner_size(width, height)
        .decorations(false)
        .center();
      if let Ok(path) = std::env::var("F4X_BENCH_RECORDER") {
        window = window.initialization_script(std::fs::read_to_string(path)?);
      }
      window.build()?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
