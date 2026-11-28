use std::io::{Read, Write};
use std::os::unix::net::UnixListener;
use std::time::Instant;

fn serve<R: Read, W: Write>(mut r: R, mut w: W, parse: bool) {
    let mut len = [0u8; 4];
    let mut buf = Vec::new();
    while r.read_exact(&mut len).is_ok() {
        let n = u32::from_le_bytes(len) as usize;
        buf.resize(n, 0);
        if r.read_exact(&mut buf).is_err() {
            break;
        }
        let mut us = 0u32;
        if parse && buf.first() == Some(&b'{') {
            let t = Instant::now();
            let _ = serde_json::from_slice::<serde_json::Value>(&buf);
            us = t.elapsed().as_micros() as u32;
        }
        if w.write_all(&us.to_le_bytes()).is_err() || w.flush().is_err() {
            break;
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let parse = true;
    if let Some(path) = args.get(1) {
        let _ = std::fs::remove_file(path);
        let l = UnixListener::bind(path).unwrap();
        println!("ready");
        let (s, _) = l.accept().unwrap();
        serve(s.try_clone().unwrap(), s, parse);
    } else {
        serve(std::io::stdin().lock(), std::io::stdout().lock(), parse);
    }
}
