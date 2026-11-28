use std::time::{Duration, SystemTime, UNIX_EPOCH};

use wayland_client::globals::{registry_queue_init, GlobalListContents};
use wayland_client::protocol::wl_pointer::ButtonState;
use wayland_client::protocol::wl_registry::WlRegistry;
use wayland_client::{delegate_noop, Connection, Dispatch, QueueHandle};
use wayland_protocols_wlr::virtual_pointer::v1::client::zwlr_virtual_pointer_manager_v1::ZwlrVirtualPointerManagerV1;
use wayland_protocols_wlr::virtual_pointer::v1::client::zwlr_virtual_pointer_v1::ZwlrVirtualPointerV1;

struct State;

impl Dispatch<WlRegistry, GlobalListContents> for State {
    fn event(_: &mut Self, _: &WlRegistry, _: wayland_client::protocol::wl_registry::Event, _: &GlobalListContents, _: &Connection, _: &QueueHandle<Self>) {}
}

delegate_noop!(State: ZwlrVirtualPointerManagerV1);
delegate_noop!(State: ZwlrVirtualPointerV1);

fn now() -> u32 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u32
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 6 {
        eprintln!("usage: vpointer move|click X Y EXTENT_W EXTENT_H");
        std::process::exit(2);
    }
    let n = |i: usize| args[i].parse::<u32>().unwrap();
    let (x, y, ew, eh) = (n(2), n(3), n(4), n(5));
    let conn = Connection::connect_to_env().expect("wayland");
    let (globals, mut queue) = registry_queue_init::<State>(&conn).expect("registry");
    let qh = queue.handle();
    let manager: ZwlrVirtualPointerManagerV1 = globals.bind(&qh, 1..=2, ()).expect("virtual pointer manager");
    let pointer = manager.create_virtual_pointer(None, &qh, ());
    pointer.motion_absolute(now(), x, y, ew, eh);
    pointer.frame();
    queue.roundtrip(&mut State).unwrap();
    if args[1] == "click" {
        std::thread::sleep(Duration::from_millis(50));
        pointer.button(now(), 0x110, ButtonState::Pressed);
        pointer.frame();
        queue.roundtrip(&mut State).unwrap();
        std::thread::sleep(Duration::from_millis(50));
        pointer.button(now(), 0x110, ButtonState::Released);
        pointer.frame();
    }
    queue.roundtrip(&mut State).unwrap();
    std::thread::sleep(Duration::from_millis(100));
    pointer.destroy();
    queue.roundtrip(&mut State).unwrap();
}
