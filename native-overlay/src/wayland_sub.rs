use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use glib::translate::ToGlibPtr;
use gtk::prelude::*;
use raw_window_handle::{RawDisplayHandle, RawWindowHandle, WaylandDisplayHandle, WaylandWindowHandle};
use wayland_backend::client::{Backend, ObjectId};
use wayland_client::globals::{registry_queue_init, GlobalListContents};
use wayland_client::protocol::wl_compositor::WlCompositor;
use wayland_client::protocol::wl_region::WlRegion;
use wayland_client::protocol::wl_registry::WlRegistry;
use wayland_client::protocol::wl_subcompositor::WlSubcompositor;
use wayland_client::protocol::wl_subsurface::WlSubsurface;
use wayland_client::protocol::wl_surface::WlSurface;
use wayland_client::{delegate_noop, Connection, Dispatch, Proxy, QueueHandle};
use wayland_protocols::wp::fractional_scale::v1::client::wp_fractional_scale_manager_v1::WpFractionalScaleManagerV1;
use wayland_protocols::wp::fractional_scale::v1::client::wp_fractional_scale_v1::{self, WpFractionalScaleV1};
use wayland_protocols::wp::viewporter::client::wp_viewport::WpViewport;
use wayland_protocols::wp::viewporter::client::wp_viewporter::WpViewporter;
use wry::{WebViewBuilder, WebViewBuilderExtUnix};

use crate::render::{self, Extent, Renderer, Shared};
use crate::{ipc, Options, HUD};

struct State {
    shared: Arc<Shared>,
}

impl Dispatch<WlRegistry, GlobalListContents> for State {
    fn event(_: &mut Self, _: &WlRegistry, _: wayland_client::protocol::wl_registry::Event, _: &GlobalListContents, _: &Connection, _: &QueueHandle<Self>) {}
}

impl Dispatch<WpFractionalScaleV1, ()> for State {
    fn event(state: &mut Self, _: &WpFractionalScaleV1, event: wp_fractional_scale_v1::Event, _: &(), _: &Connection, _: &QueueHandle<Self>) {
        if let wp_fractional_scale_v1::Event::PreferredScale { scale } = event {
            let s = scale as f64 / 120.0;
            state.shared.log(&format!("WAYLAND preferred fractional scale {s}"));
            state.shared.extent.lock().unwrap().scale = s;
        }
    }
}

delegate_noop!(State: WlCompositor);
delegate_noop!(State: WlSubcompositor);
delegate_noop!(State: ignore WlSurface);
delegate_noop!(State: WlSubsurface);
delegate_noop!(State: WlRegion);
delegate_noop!(State: WpViewporter);
delegate_noop!(State: WpViewport);
delegate_noop!(State: WpFractionalScaleManagerV1);

pub fn run(opts: Options) {
    gtk::init().expect("gtk");
    let shared = Shared::new(Extent { logical_w: opts.width, logical_h: opts.height, scale: 1.0 });
    let window = gtk::Window::new(gtk::WindowType::Toplevel);
    window.set_title("f4x-overlay");
    window.set_decorated(false);
    window.set_default_size(opts.width as i32, opts.height as i32);
    if let Some(visual) = WidgetExt::screen(&window).and_then(|s| s.rgba_visual()) {
        window.set_visual(Some(&visual));
    }
    window.set_app_paintable(true);
    window.connect_draw(|_, cr| {
        cr.set_operator(gtk::cairo::Operator::Source);
        cr.set_source_rgba(0.0, 0.0, 0.0, 0.0);
        let _ = cr.paint();
        glib::Propagation::Proceed
    });
    let _webview = opts.webview.then(|| {
        WebViewBuilder::new()
            .with_html(HUD)
            .with_transparent(true)
            .with_ipc_handler(ipc(shared.clone()))
            .build_gtk(&window)
            .expect("webview")
    });
    window.connect_delete_event(|_, _| {
        gtk::main_quit();
        glib::Propagation::Proceed
    });
    window.show_all();

    let gdk_window = WidgetExt::window(&window).expect("realized");
    let gdk_display = gdk_window.display();
    let parent_ptr = unsafe { gdk_wayland_sys::gdk_wayland_window_get_wl_surface({ let w: *mut gtk::gdk::ffi::GdkWindow = gdk_window.to_glib_none().0; w as *mut _ }) } as *mut c_void;
    let display_ptr = unsafe { gdk_wayland_sys::gdk_wayland_display_get_wl_display({ let d: *mut gtk::gdk::ffi::GdkDisplay = gdk_display.to_glib_none().0; d as *mut _ }) } as *mut c_void;
    assert!(!parent_ptr.is_null() && !display_ptr.is_null(), "GDK is not on Wayland");
    let gdk_scale = window.scale_factor() as f64;
    shared.log(&format!("GTK realized on Wayland, gdk scale factor {gdk_scale}"));
    shared.extent.lock().unwrap().scale = gdk_scale;

    let conn = Connection::from_backend(unsafe { Backend::from_foreign_display(display_ptr as *mut _) });
    let (globals, mut queue) = registry_queue_init::<State>(&conn).expect("registry");
    let qh = queue.handle();
    let compositor: WlCompositor = globals.bind(&qh, 4..=6, ()).expect("wl_compositor");
    let subcompositor: WlSubcompositor = globals.bind(&qh, 1..=1, ()).expect("wl_subcompositor");
    let viewporter: WpViewporter = globals.bind(&qh, 1..=1, ()).expect("wp_viewporter");
    let fractional: Option<WpFractionalScaleManagerV1> = globals.bind(&qh, 1..=1, ()).ok();
    let parent_id = unsafe { ObjectId::from_ptr(WlSurface::interface(), parent_ptr as *mut _) }.expect("parent id");
    let parent = WlSurface::from_id(&conn, parent_id).expect("parent surface");
    let child = compositor.create_surface(&qh, ());
    let subsurface = subcompositor.get_subsurface(&child, &parent, &qh, ());
    if std::env::var_os("F4X_ABOVE").is_some() {
        subsurface.place_above(&parent);
    } else {
        subsurface.place_below(&parent);
    }
    let offset: i32 = std::env::var("F4X_OFFSET").ok().and_then(|v| v.parse().ok()).unwrap_or(0);
    subsurface.set_position(offset, offset);
    subsurface.set_desync();
    let region = compositor.create_region(&qh, ());
    child.set_input_region(Some(&region));
    region.destroy();
    let viewport = viewporter.get_viewport(&child, &qh, ());
    let _fractional = fractional.as_ref().map(|f| f.get_fractional_scale(&child, &qh, ()));
    shared.log(&format!("WAYLAND subsurface below GTK toplevel, fractional-scale {}", fractional.is_some()));
    conn.flush().expect("flush");
    window.queue_draw();

    let mut state = State { shared: shared.clone() };
    let _ = queue.roundtrip(&mut state);
    {
        let conn = conn.clone();
        let shared = shared.clone();
        glib::timeout_add_local(Duration::from_millis(4), move || {
            let _ = queue.dispatch_pending(&mut state);
            let _ = conn.flush();
            if shared.stop.load(Ordering::Relaxed) {
                gtk::main_quit();
                return glib::ControlFlow::Break;
            }
            glib::ControlFlow::Continue
        });
    }
    {
        let shared = shared.clone();
        window.connect_size_allocate(move |_, alloc| {
            let mut e = shared.extent.lock().unwrap();
            if e.logical_w != alloc.width() as u32 || e.logical_h != alloc.height() as u32 {
                e.logical_w = alloc.width() as u32;
                e.logical_h = alloc.height() as u32;
                drop(e);
                shared.log(&format!("GTK size-allocate {}x{}", alloc.width(), alloc.height()));
            }
        });
    }
    let alloc = window.allocation();
    {
        let mut e = shared.extent.lock().unwrap();
        e.logical_w = alloc.width() as u32;
        e.logical_h = alloc.height() as u32;
    }

    let instance = render::instance();
    let surface = unsafe {
        instance.create_surface_unsafe(wgpu::SurfaceTargetUnsafe::RawHandle {
            raw_display_handle: RawDisplayHandle::Wayland(WaylandDisplayHandle::new(NonNull::new(display_ptr).unwrap())),
            raw_window_handle: RawWindowHandle::Wayland(WaylandWindowHandle::new(NonNull::new(child.id().as_ptr() as *mut c_void).unwrap())),
        })
    }
    .expect("wgpu surface");
    let extent = *shared.extent.lock().unwrap();
    let renderer = Renderer::new(&instance, surface, extent, &shared);
    let render_thread = {
        let shared = shared.clone();
        std::thread::spawn(move || {
            renderer.run(shared, move |e| viewport.set_destination(e.logical_w as i32, e.logical_h as i32));
        })
    };
    render::stop_after(shared.clone(), opts.seconds);
    gtk::main();
    shared.stop.store(true, Ordering::Relaxed);
    render_thread.join().unwrap();
    shared.log("EXIT");
}
