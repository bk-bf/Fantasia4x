use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::platform::x11::EventLoopBuilderExtX11;
use winit::window::{Window, WindowId};
use wry::dpi::{LogicalPosition, LogicalSize};
use wry::{Rect, WebView, WebViewBuilder};

use crate::render::{self, Extent, Renderer, Shared};
use crate::{ipc, Options, HUD};

struct App {
    opts: Options,
    shared: Arc<Shared>,
    window: Option<Arc<Window>>,
    webview: Option<WebView>,
    render: Option<JoinHandle<()>>,
}

fn bounds(e: Extent) -> Rect {
    Rect { position: LogicalPosition::new(0, 0).into(), size: LogicalSize::new(e.logical_w, e.logical_h).into() }
}

impl App {
    fn extent(window: &Window) -> Extent {
        let scale = window.scale_factor();
        let size = window.inner_size();
        Extent {
            logical_w: (size.width as f64 / scale).round() as u32,
            logical_h: (size.height as f64 / scale).round() as u32,
            scale,
        }
    }
}

impl ApplicationHandler for App {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }
        let attrs = Window::default_attributes()
            .with_title("f4x-overlay-x11")
            .with_decorations(false)
            .with_inner_size(winit::dpi::LogicalSize::new(self.opts.width, self.opts.height));
        let window = Arc::new(event_loop.create_window(attrs).expect("window"));
        let extent = Self::extent(&window);
        *self.shared.extent.lock().unwrap() = extent;
        self.shared.log(&format!("WINIT x11 window {extent:?}"));
        let instance = render::instance();
        let surface = instance.create_surface(window.clone()).expect("surface");
        let renderer = Renderer::new(&instance, surface, extent, &self.shared);
        if self.opts.webview {
            self.webview = Some(
                WebViewBuilder::new()
                    .with_html(HUD)
                    .with_transparent(true)
                    .with_bounds(bounds(extent))
                    .with_ipc_handler(ipc(self.shared.clone()))
                    .build_as_child(&*window)
                    .expect("child webview"),
            );
        }
        let shared = self.shared.clone();
        self.render = Some(std::thread::spawn(move || renderer.run(shared, |_| {})));
        self.window = Some(window);
        render::stop_after(self.shared.clone(), self.opts.seconds);
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                if let Some(window) = &self.window {
                    let e = Self::extent(window);
                    *self.shared.extent.lock().unwrap() = e;
                    self.shared.log(&format!("WINIT resized {e:?}"));
                    if let Some(wv) = &self.webview {
                        let _ = wv.set_bounds(bounds(e));
                    }
                }
            }
            WindowEvent::MouseInput { state, button, .. } => self.shared.log(&format!("INPUT winit {button:?} {state:?}")),
            WindowEvent::CloseRequested => event_loop.exit(),
            _ => {}
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        while gtk::events_pending() {
            gtk::main_iteration_do(false);
        }
        if self.shared.stop.load(Ordering::Relaxed) {
            event_loop.exit();
        }
        event_loop.set_control_flow(ControlFlow::WaitUntil(Instant::now() + Duration::from_millis(4)));
    }

    fn exiting(&mut self, _: &ActiveEventLoop) {
        self.shared.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.render.take() {
            t.join().unwrap();
        }
        self.shared.log("EXIT");
    }
}

pub fn run(opts: Options) {
    std::env::set_var("GDK_BACKEND", "x11");
    gtk::init().expect("gtk");
    let shared = Shared::new(Extent { logical_w: opts.width, logical_h: opts.height, scale: 1.0 });
    let event_loop = EventLoop::builder().with_x11().build().expect("x11 event loop");
    let mut app = App { opts, shared, window: None, webview: None, render: None };
    event_loop.run_app(&mut app).expect("run");
}
