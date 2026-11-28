mod capture;
mod replay;
mod shaders;

use capture::Capture;
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use winit::application::ApplicationHandler;
use winit::dpi::PhysicalSize;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::window::{Window, WindowId};

struct Args {
    capture: String,
    frames: usize,
    warmup: usize,
    backend: wgpu::Backends,
    empty: bool,
    label: String,
    skip: Vec<String>,
}

fn args() -> (String, Args) {
    let mut it = std::env::args().skip(1);
    let cmd = it.next().unwrap_or_default();
    let mut a = Args { capture: String::new(), frames: 0, warmup: 120, backend: wgpu::Backends::VULKAN, empty: false, label: String::new(), skip: vec![] };
    while let Some(x) = it.next() {
        match x.as_str() {
            "--frames" => a.frames = it.next().unwrap().parse().unwrap(),
            "--warmup" => a.warmup = it.next().unwrap().parse().unwrap(),
            "--backend" => {
                a.backend = match it.next().unwrap().as_str() {
                    "gl" => wgpu::Backends::GL,
                    _ => wgpu::Backends::VULKAN,
                }
            }
            "--empty" => a.empty = true,
            "--label" => a.label = it.next().unwrap(),
            "--skip" => a.skip = it.next().unwrap().split(',').map(String::from).collect(),
            other => a.capture = other.to_string(),
        }
    }
    (cmd, a)
}

fn quantile(v: &mut [f64], p: f64) -> f64 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    if v.is_empty() {
        return 0.0;
    }
    v[((v.len() as f64 * p) as usize).min(v.len() - 1)]
}

fn round(x: f64) -> f64 {
    (x * 1000.0).round() / 1000.0
}

struct Readback {
    buffer: wgpu::Buffer,
    ready: Arc<AtomicBool>,
    busy: bool,
}

struct Gpu {
    window: Arc<Window>,
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    scene: replay::Scene,
    queries: Option<(wgpu::QuerySet, wgpu::Buffer, Vec<Readback>)>,
    period: f64,
    info: serde_json::Value,
}

struct App {
    args: Args,
    cap: Capture,
    gpu: Option<Gpu>,
    frame: usize,
    last: Option<Instant>,
    intervals: Vec<f64>,
    cpu: Vec<f64>,
    gpu_ms: Vec<f64>,
}

const RING: usize = 4;

impl App {
    fn init(&mut self, el: &ActiveEventLoop) -> Gpu {
        let (w, h) = self.cap.canvas_size();
        let window = Arc::new(el.create_window(Window::default_attributes().with_title("render-native").with_inner_size(PhysicalSize::new(w, h))).unwrap());
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor { backends: self.args.backend, ..wgpu::InstanceDescriptor::new_with_display_handle(Box::new(el.owned_display_handle())) });
        let surface = instance.create_surface(window.clone()).unwrap();
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
            apply_limit_buckets: false,
        }))
        .unwrap();
        let ai = adapter.get_info();
        let timestamps = adapter.features().contains(wgpu::Features::TIMESTAMP_QUERY);
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: None,
            required_features: if timestamps { wgpu::Features::TIMESTAMP_QUERY } else { wgpu::Features::empty() },
            required_limits: adapter.limits(),
            ..Default::default()
        }))
        .unwrap();
        let caps = surface.get_capabilities(&adapter);
        let wanted: wgpu::TextureFormat = serde_json::from_value(json!(self.cap.canvas_format())).unwrap();
        let format = if caps.formats.contains(&wanted) { wanted } else { caps.formats.iter().copied().find(|f| !f.is_srgb()).unwrap_or(caps.formats[0]) };
        let present_mode = [wgpu::PresentMode::Immediate, wgpu::PresentMode::Mailbox, wgpu::PresentMode::Fifo].into_iter().find(|m| caps.present_modes.contains(m)).unwrap();
        surface.configure(
            &device,
            &wgpu::SurfaceConfiguration {
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                format,
                width: w,
                height: h,
                present_mode,
                desired_maximum_frame_latency: 2,
                alpha_mode: caps.alpha_modes[0],
                view_formats: vec![],
                ..surface.get_default_config(&adapter, w, h).unwrap()
            },
        );
        let t0 = Instant::now();
        let mut scene = replay::Build { device: &device, queue: &queue, canvas_format: format }.scene(&self.cap);
        scene.skip(&self.args.skip);
        let build_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let queries = timestamps.then(|| {
            let count = (scene.passes * 2).max(2) as u32;
            let qs = device.create_query_set(&wgpu::QuerySetDescriptor { label: None, ty: wgpu::QueryType::Timestamp, count });
            let resolve = device.create_buffer(&wgpu::BufferDescriptor { label: None, size: count as u64 * 8, usage: wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC, mapped_at_creation: false });
            let ring = (0..RING)
                .map(|_| Readback {
                    buffer: device.create_buffer(&wgpu::BufferDescriptor { label: None, size: count as u64 * 8, usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false }),
                    ready: Arc::new(AtomicBool::new(false)),
                    busy: false,
                })
                .collect();
            (qs, resolve, ring)
        });
        let draws = scene.ops.iter().filter(|o| matches!(o, replay::Op::Draw(..) | replay::Op::DrawIndexed(..))).count();
        let info = json!({
            "adapter": ai.name,
            "driver": ai.driver,
            "driverInfo": ai.driver_info,
            "backend": format!("{:?}", ai.backend),
            "deviceType": format!("{:?}", ai.device_type),
            "surfaceFormat": format!("{format:?}"),
            "canvasFormat": self.cap.canvas_format(),
            "presentMode": format!("{present_mode:?}"),
            "size": [w, h],
            "passes": scene.passes,
            "draws": draws,
            "pipelines": scene.pipeline_labels,
            "buildMs": round(build_ms),
            "errors": scene.errors,
            "timestamps": timestamps,
        });
        eprintln!("INFO {info}");
        let period = queue.get_timestamp_period() as f64;
        Gpu { window, surface, device, queue, scene, queries, period, info }
    }

    fn render(&mut self, el: &ActiveEventLoop) {
        let g = self.gpu.as_mut().unwrap();
        let now = Instant::now();
        if let Some(l) = self.last {
            if self.frame > self.args.warmup {
                self.intervals.push(now.duration_since(l).as_secs_f64() * 1000.0);
            }
        }
        self.last = Some(now);
        let frame = match g.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(t) | wgpu::CurrentSurfaceTexture::Suboptimal(t) => t,
            other => {
                eprintln!("acquire failed: {:?}", std::mem::discriminant(&other));
                g.window.request_redraw();
                return;
            }
        };
        let t_cpu = Instant::now();
        let view = frame.texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mut enc = g.device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        let qs = g.queries.as_ref().map(|q| &q.0);
        let passes = g.scene.encode(&mut enc, &view, qs, self.args.empty);
        let mut slot = None;
        if let Some((qs, resolve, ring)) = g.queries.as_mut() {
            if let Some(i) = ring.iter().position(|r| !r.busy) {
                let n = (passes * 2) as u32;
                enc.resolve_query_set(qs, 0..n, resolve, 0);
                enc.copy_buffer_to_buffer(resolve, 0, &ring[i].buffer, 0, n as u64 * 8);
                slot = Some(i);
            }
        }
        g.queue.submit([enc.finish()]);
        g.queue.present(frame);
        let cpu_ms = t_cpu.elapsed().as_secs_f64() * 1000.0;
        if let (Some(i), Some((_, _, ring))) = (slot, g.queries.as_mut()) {
            let r = &mut ring[i];
            r.busy = true;
            let ready = r.ready.clone();
            r.buffer.map_async(wgpu::MapMode::Read, .., move |res| {
                if res.is_ok() {
                    ready.store(true, Ordering::Release);
                }
            });
        }
        let _ = g.device.poll(wgpu::PollType::Poll);
        if let Some((_, _, ring)) = g.queries.as_mut() {
            for r in ring.iter_mut().filter(|r| r.busy && r.ready.load(Ordering::Acquire)) {
                {
                    let data = r.buffer.get_mapped_range(..).unwrap();
                    let t: Vec<u64> = data.chunks_exact(8).map(|c| u64::from_le_bytes(c.try_into().unwrap())).collect();
                    let total: f64 = (0..passes).map(|p| t[p * 2 + 1].wrapping_sub(t[p * 2]) as f64 * g.period / 1e6).sum();
                    if self.frame > self.args.warmup {
                        self.gpu_ms.push(total);
                    }
                }
                r.buffer.unmap();
                r.ready.store(false, Ordering::Release);
                r.busy = false;
            }
        }
        if self.frame > self.args.warmup {
            self.cpu.push(cpu_ms);
        }
        self.frame += 1;
        if self.args.frames > 0 && self.frame > self.args.frames + self.args.warmup {
            let fps_frames = self.intervals.len();
            let mean: f64 = self.intervals.iter().sum::<f64>() / fps_frames.max(1) as f64;
            let row = json!({
                "label": self.args.label,
                "capture": self.args.capture,
                "empty": self.args.empty,
                "skip": self.args.skip,
                "frames": fps_frames,
                "fps": round(1000.0 / mean),
                "frameP50Ms": round(quantile(&mut self.intervals, 0.5)),
                "frameP95Ms": round(quantile(&mut self.intervals, 0.95)),
                "cpuSubmitPresentP50Ms": round(quantile(&mut self.cpu, 0.5)),
                "cpuSubmitPresentP95Ms": round(quantile(&mut self.cpu, 0.95)),
                "gpuSamples": self.gpu_ms.len(),
                "gpuP50Ms": round(quantile(&mut self.gpu_ms, 0.5)),
                "gpuP95Ms": round(quantile(&mut self.gpu_ms, 0.95)),
                "info": g.info,
            });
            println!("ROW {row}");
            el.exit();
            return;
        }
        g.window.request_redraw();
    }
}

impl ApplicationHandler for App {
    fn resumed(&mut self, el: &ActiveEventLoop) {
        if self.gpu.is_none() {
            let g = self.init(el);
            g.window.request_redraw();
            self.gpu = Some(g);
        }
    }

    fn window_event(&mut self, el: &ActiveEventLoop, _: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::CloseRequested => el.exit(),
            WindowEvent::RedrawRequested => self.render(el),
            _ => {}
        }
    }
}

fn main() {
    let (cmd, a) = args();
    match cmd.as_str() {
        "check" => {
            let cap = Capture::load(&a.capture);
            println!("{}", serde_json::to_string_pretty(&shaders::ledger(cap.objects())).unwrap());
        }
        "run" => {
            let cap = Capture::load(&a.capture);
            let el = EventLoop::new().unwrap();
            el.set_control_flow(ControlFlow::Poll);
            let mut app = App { args: a, cap, gpu: None, frame: 0, last: None, intervals: vec![], cpu: vec![], gpu_ms: vec![] };
            el.run_app(&mut app).unwrap();
        }
        _ => {
            eprintln!("usage: render-native check <capture.f4xc> | run <capture.f4xc> [--frames N] [--warmup N] [--backend vulkan|gl] [--empty] [--label L]");
            std::process::exit(2);
        }
    }
}
