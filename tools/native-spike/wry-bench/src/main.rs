use std::borrow::Cow;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::WindowBuilder;
use wry::http::{header::CONTENT_TYPE, Request, Response};
use wry::WebViewBuilder;

enum User {
    Eval(String),
    Done(String),
}

fn mime(p: &str) -> &'static str {
    match p.rsplit('.').next() {
        Some("html") => "text/html",
        Some("js") => "text/javascript",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}

fn serve(dir: &PathBuf, req: Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let path = req.uri().path().trim_start_matches('/').to_string();
    if path == "sink" {
        let n = req.body().len();
        return Response::builder()
            .header(CONTENT_TYPE, "text/plain")
            .header("Access-Control-Allow-Origin", "*")
            .body(Cow::Owned(n.to_string().into_bytes()))
            .unwrap();
    }
    match std::fs::read(dir.join(&path)) {
        Ok(b) => Response::builder()
            .header(CONTENT_TYPE, mime(&path))
            .header("Cross-Origin-Opener-Policy", "same-origin")
            .header("Cross-Origin-Embedder-Policy", "require-corp")
            .body(Cow::Owned(b))
            .unwrap(),
        Err(_) => Response::builder().status(404).body(Cow::Borrowed(&b""[..])).unwrap(),
    }
}

fn main() -> wry::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let dir = PathBuf::from(&args[1]);
    let page = args.get(2).cloned().unwrap_or_else(|| "index.html".into());
    let out = args.get(3).cloned().unwrap_or_default();
    let limit = Duration::from_secs(args.get(4).and_then(|s| s.parse().ok()).unwrap_or(1800));

    let event_loop = EventLoopBuilder::<User>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let window = WindowBuilder::new().with_title("wry-bench").build(&event_loop).unwrap();

    let ipc_proxy = proxy.clone();
    let snapshot = std::fs::read_to_string(dir.join("typical.json")).unwrap_or_default();
    let push = format!("__ack(JSON.stringify({snapshot}).length)");
    let handler = move |req: Request<String>| {
        let body = req.body();
        if let Some(id) = body.strip_prefix("p:") {
            let _ = ipc_proxy.send_event(User::Eval(format!("__pong({id})")));
        } else if let Some(rest) = body.strip_prefix("b:") {
            let _ = ipc_proxy.send_event(User::Eval(format!("__ack({})", rest.len())));
        } else if let Some(rest) = body.strip_prefix("j:") {
            let t = Instant::now();
            let parsed = serde_json::from_str::<serde_json::Value>(rest).is_ok();
            let us = if parsed { t.elapsed().as_micros() as i64 } else { -1 };
            let _ = ipc_proxy.send_event(User::Eval(format!("__ack({us})")));
        } else if body == "s" {
            let _ = ipc_proxy.send_event(User::Eval(push.clone()));
        } else if body.starts_with("{\"kind\":\"result\"") || body.starts_with("{\"kind\":\"error\"") {
            let _ = ipc_proxy.send_event(User::Done(body.clone()));
        } else if body.starts_with("{\"kind\":\"log\"") {
            println!("{body}");
        }
    };

    let serve_dir = dir.clone();
    let wb = WebViewBuilder::new()
        .with_custom_protocol("bench".into(), move |_id, req| serve(&serve_dir, req))
        .with_ipc_handler(handler)
        .with_url(format!("bench://localhost/{page}"));
    let webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        wb.build_gtk(window.default_vbox().unwrap())?
    };

    let started = Instant::now();
    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::WaitUntil(Instant::now() + Duration::from_secs(5));
        match event {
            Event::UserEvent(User::Eval(js)) => {
                let _ = webview.evaluate_script(&js);
            }
            Event::UserEvent(User::Done(body)) => {
                if !out.is_empty() {
                    std::fs::write(&out, &body).unwrap();
                }
                println!("{}", &body[..body.len().min(400)]);
                *control_flow = ControlFlow::Exit;
            }
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => *control_flow = ControlFlow::Exit,
            _ => {
                if started.elapsed() > limit {
                    eprintln!("timeout");
                    std::process::exit(3);
                }
            }
        }
    });
}
