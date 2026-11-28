use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Extent {
    pub logical_w: u32,
    pub logical_h: u32,
    pub scale: f64,
}

impl Extent {
    pub fn physical(&self) -> (u32, u32) {
        (
            ((self.logical_w as f64) * self.scale).round().max(1.0) as u32,
            ((self.logical_h as f64) * self.scale).round().max(1.0) as u32,
        )
    }
}

pub struct Shared {
    pub extent: Mutex<Extent>,
    pub click: Mutex<(f32, f32, Instant)>,
    pub stop: AtomicBool,
    pub started: Instant,
}

impl Shared {
    pub fn new(extent: Extent) -> Arc<Self> {
        Arc::new(Self {
            extent: Mutex::new(extent),
            click: Mutex::new((-1000.0, -1000.0, Instant::now())),
            stop: AtomicBool::new(false),
            started: Instant::now(),
        })
    }

    pub fn log(&self, line: &str) {
        println!("[{:>9.3}] {line}", self.started.elapsed().as_secs_f64());
    }

    pub fn world_click(&self, x: f32, y: f32) {
        *self.click.lock().unwrap() = (x, y, Instant::now());
    }
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct Uniforms {
    size: [f32; 2],
    time: f32,
    scale: f32,
    click: [f32; 2],
    click_age: f32,
    pad: f32,
}

const SHADER: &str = r#"
struct U { size: vec2<f32>, time: f32, scale: f32, click: vec2<f32>, click_age: f32, pad: f32 };
@group(0) @binding(0) var<uniform> u: U;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let p = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));
    return vec4<f32>(p * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let logical = pos.xy / u.scale;
    let uv = pos.xy / u.size;
    let stripe = step(0.5, fract((logical.x + logical.y + u.time * 120.0) / 64.0));
    let base = vec3<f32>(0.1 + 0.5 * uv.x, 0.25 + 0.35 * sin(u.time), 0.1 + 0.5 * uv.y);
    var col = mix(base, base * 0.35, stripe);
    let px = step(0.5, fract(pos.x * 0.5)) * step(logical.y, 8.0);
    col = mix(col, vec3<f32>(1.0, 1.0, 1.0), px);
    let d = distance(logical, u.click);
    let ring = (1.0 - smoothstep(0.0, 3.0, abs(d - 30.0))) * step(u.click_age, 5.0);
    col = mix(col, vec3<f32>(1.0, 1.0, 0.0), ring);
    let edge = step(logical.x, 3.0) + step(logical.y, 3.0) + step(u.size.x / u.scale - 3.0, logical.x) + step(u.size.y / u.scale - 3.0, logical.y);
    col = mix(col, vec3<f32>(1.0, 0.0, 1.0), min(edge, 1.0));
    return vec4<f32>(col, 1.0);
}
"#;

pub fn instance() -> wgpu::Instance {
    wgpu::Instance::new(&wgpu::InstanceDescriptor {
        backends: wgpu::Backends::VULKAN,
        ..wgpu::InstanceDescriptor::from_env_or_default()
    })
}

pub struct Renderer {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    pipeline: wgpu::RenderPipeline,
    ubuf: wgpu::Buffer,
    bind: wgpu::BindGroup,
}

impl Renderer {
    pub fn new(instance: &wgpu::Instance, surface: wgpu::Surface<'static>, extent: Extent, shared: &Shared) -> Self {
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
        }))
        .expect("adapter");
        let info = adapter.get_info();
        shared.log(&format!(
            "ADAPTER name={} backend={:?} type={:?} driver={} {}",
            info.name, info.backend, info.device_type, info.driver, info.driver_info
        ));
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default())).expect("device");
        let caps = surface.get_capabilities(&adapter);
        shared.log(&format!("SURFACE formats={:?} present={:?} alpha={:?}", caps.formats, caps.present_modes, caps.alpha_modes));
        let format = [wgpu::TextureFormat::Bgra8Unorm, wgpu::TextureFormat::Rgba8Unorm].into_iter().find(|f| caps.formats.contains(f)).unwrap_or(caps.formats[0]);
        let (w, h) = extent.physical();
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: w,
            height: h,
            present_mode: wgpu::PresentMode::Fifo,
            desired_maximum_frame_latency: 2,
            alpha_mode: if std::env::var_os("F4X_OPAQUE").is_none() && caps.alpha_modes.contains(&wgpu::CompositeAlphaMode::PreMultiplied) { wgpu::CompositeAlphaMode::PreMultiplied } else { caps.alpha_modes[0] },
            view_formats: vec![],
        };
        shared.log(&format!("CONFIG format={:?} alpha={:?} present={:?}", config.format, config.alpha_mode, config.present_mode));
        surface.configure(&device, &config);
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: None,
            source: wgpu::ShaderSource::Wgsl(SHADER.into()),
        });
        let ubuf = device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: std::mem::size_of::<Uniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &layout,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: ubuf.as_entire_binding() }],
        });
        let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[&layout],
            push_constant_ranges: &[],
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&pl),
            vertex: wgpu::VertexState { module: &module, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fs"),
                targets: &[Some(format.into())],
                compilation_options: Default::default(),
            }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview: None,
            cache: None,
        });
        Self { surface, device, queue, config, pipeline, ubuf, bind }
    }

    pub fn run(mut self, shared: Arc<Shared>, before_present: impl Fn(Extent)) {
        let mut extent = *shared.extent.lock().unwrap();
        before_present(extent);
        let mut intervals: Vec<f64> = Vec::with_capacity(8192);
        let mut last: Option<Instant> = None;
        let mut frame: u64 = 0;
        while !shared.stop.load(Ordering::Relaxed) {
            let want = *shared.extent.lock().unwrap();
            if want != extent {
                let (w, h) = want.physical();
                self.config.width = w;
                self.config.height = h;
                self.surface.configure(&self.device, &self.config);
                before_present(want);
                shared.log(&format!("RESIZE frame={frame} logical={}x{} scale={} buffer={w}x{h}", want.logical_w, want.logical_h, want.scale));
                extent = want;
                last = None;
            }
            let tex = match self.surface.get_current_texture() {
                Ok(t) => t,
                Err(e) => {
                    shared.log(&format!("SURFACE error {e:?}"));
                    self.surface.configure(&self.device, &self.config);
                    continue;
                }
            };
            let (cx, cy, ct) = *shared.click.lock().unwrap();
            let u = Uniforms {
                size: [self.config.width as f32, self.config.height as f32],
                time: shared.started.elapsed().as_secs_f32(),
                scale: extent.scale as f32,
                click: [cx, cy],
                click_age: ct.elapsed().as_secs_f32(),
                pad: 0.0,
            };
            self.queue.write_buffer(&self.ubuf, 0, bytemuck::bytes_of(&u));
            let view = tex.texture.create_view(&Default::default());
            let mut enc = self.device.create_command_encoder(&Default::default());
            {
                let mut pass = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: None,
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &view,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                });
                pass.set_pipeline(&self.pipeline);
                pass.set_bind_group(0, &self.bind, &[]);
                pass.draw(0..3, 0..1);
            }
            self.queue.submit([enc.finish()]);
            tex.present();
            let now = Instant::now();
            if let Some(prev) = last {
                intervals.push((now - prev).as_secs_f64() * 1000.0);
            }
            last = Some(now);
            frame += 1;
            if frame % 300 == 0 {
                shared.log(&format!("FRAME {frame}"));
            }
        }
        report(&shared, &intervals);
    }
}

fn report(shared: &Shared, intervals: &[f64]) {
    let skip = intervals.len().min(60);
    let mut v: Vec<f64> = intervals[skip..].to_vec();
    if v.is_empty() {
        shared.log("PACING no frames");
        return;
    }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let q = |p: f64| v[((v.len() - 1) as f64 * p).round() as usize];
    let mean = v.iter().sum::<f64>() / v.len() as f64;
    let over = v.iter().filter(|x| **x > 16.67 * 1.5).count();
    shared.log(&format!(
        "PACING n={} mean={mean:.3} p50={:.3} p95={:.3} p99={:.3} max={:.3} over25ms={over}",
        v.len(),
        q(0.5),
        q(0.95),
        q(0.99),
        v[v.len() - 1]
    ));
}

pub fn stop_after(shared: Arc<Shared>, seconds: u64) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(seconds));
        shared.stop.store(true, Ordering::Relaxed);
    });
}
