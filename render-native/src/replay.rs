use crate::capture::{b, f, id, n, s, Capture};
use crate::shaders;
use serde_json::Value;
use std::collections::HashMap;
use wgpu::*;

pub enum Target {
    Canvas,
    View(usize),
}

pub struct ColorAtt {
    target: Target,
    clear: Option<Color>,
    store: StoreOp,
}

pub struct DepthAtt {
    view: usize,
    depth: Option<(Option<f32>, StoreOp)>,
    stencil: Option<(Option<u32>, StoreOp)>,
}

pub enum Op {
    Begin { label: String, color: Vec<ColorAtt>, depth: Option<DepthAtt> },
    Pipeline(usize),
    BindGroup(u32, usize, Vec<u32>),
    Vertex(u32, usize, u64, Option<u64>),
    Index(usize, IndexFormat, u64, Option<u64>),
    Stencil(u32),
    Viewport([f32; 6]),
    Scissor([u32; 4]),
    Draw(u32, u32, u32, u32),
    DrawIndexed(u32, u32, u32, i32, u32),
    End,
}

pub struct Scene {
    pub buffers: Vec<Buffer>,
    pub views: Vec<TextureView>,
    pub groups: Vec<BindGroup>,
    pub pipelines: Vec<RenderPipeline>,
    pub pipeline_labels: Vec<String>,
    pub ops: Vec<Op>,
    pub passes: usize,
    pub errors: Vec<String>,
}

fn format(name: &str) -> TextureFormat {
    serde_json::from_value(Value::String(name.to_string())).unwrap_or_else(|_| panic!("texture format {name}"))
}

fn kebab<T: serde::de::DeserializeOwned>(name: &str) -> T {
    serde_json::from_value(Value::String(name.to_string())).unwrap_or_else(|_| panic!("unknown value {name}"))
}

fn vertex_format(name: &str) -> VertexFormat {
    match name {
        "float32" => VertexFormat::Float32,
        "float32x2" => VertexFormat::Float32x2,
        "float32x3" => VertexFormat::Float32x3,
        "float32x4" => VertexFormat::Float32x4,
        "uint32" => VertexFormat::Uint32,
        "uint32x2" => VertexFormat::Uint32x2,
        "uint32x3" => VertexFormat::Uint32x3,
        "uint32x4" => VertexFormat::Uint32x4,
        "sint32" => VertexFormat::Sint32,
        "unorm8x4" => VertexFormat::Unorm8x4,
        "uint8x4" => VertexFormat::Uint8x4,
        "uint16x2" => VertexFormat::Uint16x2,
        "uint16x4" => VertexFormat::Uint16x4,
        other => panic!("vertex format {other}"),
    }
}

fn store(v: &Value, key: &str) -> StoreOp {
    if s(v, key, "store") == "discard" {
        StoreOp::Discard
    } else {
        StoreOp::Store
    }
}

fn binding_type(e: &Value) -> BindingType {
    if let Some(buf) = e.get("buffer").filter(|v| !v.is_null()) {
        return BindingType::Buffer {
            ty: match s(buf, "type", "uniform") {
                "storage" => BufferBindingType::Storage { read_only: false },
                "read-only-storage" => BufferBindingType::Storage { read_only: true },
                _ => BufferBindingType::Uniform,
            },
            has_dynamic_offset: b(buf, "hasDynamicOffset"),
            min_binding_size: BufferSize::new(n(buf, "minBindingSize", 0)),
        };
    }
    if let Some(sm) = e.get("sampler").filter(|v| !v.is_null()) {
        return BindingType::Sampler(match s(sm, "type", "filtering") {
            "non-filtering" => SamplerBindingType::NonFiltering,
            "comparison" => SamplerBindingType::Comparison,
            _ => SamplerBindingType::Filtering,
        });
    }
    let t = &e["texture"];
    BindingType::Texture {
        sample_type: match s(t, "sampleType", "float") {
            "unfilterable-float" => TextureSampleType::Float { filterable: false },
            "uint" => TextureSampleType::Uint,
            "sint" => TextureSampleType::Sint,
            "depth" => TextureSampleType::Depth,
            _ => TextureSampleType::Float { filterable: true },
        },
        view_dimension: view_dimension(s(t, "viewDimension", "2d")),
        multisampled: b(t, "multisampled"),
    }
}

fn view_dimension(d: &str) -> TextureViewDimension {
    match d {
        "1d" => TextureViewDimension::D1,
        "2d-array" => TextureViewDimension::D2Array,
        "cube" => TextureViewDimension::Cube,
        "3d" => TextureViewDimension::D3,
        _ => TextureViewDimension::D2,
    }
}

fn blend_component(c: &Value) -> BlendComponent {
    BlendComponent {
        src_factor: kebab(s(c, "srcFactor", "one")),
        dst_factor: kebab(s(c, "dstFactor", "zero")),
        operation: kebab(s(c, "operation", "add")),
    }
}

fn stencil_face(v: &Value) -> StencilFaceState {
    if v.is_null() {
        return StencilFaceState::IGNORE;
    }
    StencilFaceState {
        compare: kebab(s(v, "compare", "always")),
        fail_op: kebab(s(v, "failOp", "keep")),
        depth_fail_op: kebab(s(v, "depthFailOp", "keep")),
        pass_op: kebab(s(v, "passOp", "keep")),
    }
}

pub struct Build<'a> {
    pub device: &'a Device,
    pub queue: &'a Queue,
    pub canvas_format: TextureFormat,
}

impl Build<'_> {
    pub fn scene(&self, cap: &Capture) -> Scene {
        let objects: HashMap<u64, &Value> = cap.objects().iter().map(|o| (o["id"].as_u64().unwrap(), o)).collect();
        let mut buffer_ix = HashMap::new();
        let mut buffers = Vec::new();
        let mut textures: HashMap<u64, Option<Texture>> = HashMap::new();
        let mut view_ix: HashMap<u64, Option<usize>> = HashMap::new();
        let mut views = Vec::new();
        let mut samplers = HashMap::new();
        let mut bgls = HashMap::new();
        let mut modules = HashMap::new();
        let mut errors = Vec::new();
        let mut ids: Vec<&u64> = objects.keys().collect();
        ids.sort();
        let device = self.device;
        for &oid in &ids {
            let o = objects[oid];
            match o["kind"].as_str().unwrap() {
                "buffer" => {
                    let size = n(o, "size", 0).div_ceil(4) * 4;
                    let buf = device.create_buffer(&BufferDescriptor {
                        label: Some(s(o, "label", "")),
                        size,
                        usage: BufferUsages::from_bits_truncate(n(o, "usage", 0) as u32) | BufferUsages::COPY_DST,
                        mapped_at_creation: false,
                    });
                    let data = cap.blob(o);
                    let whole = data.len() / 4 * 4;
                    self.queue.write_buffer(&buf, 0, &data[..whole]);
                    buffer_ix.insert(*oid, buffers.len());
                    buffers.push(buf);
                }
                "texture" if b(o, "canvas") => {
                    textures.insert(*oid, None);
                }
                "texture" => {
                    let sz = &o["size"];
                    let size = Extent3d {
                        width: sz[0].as_u64().unwrap() as u32,
                        height: sz[1].as_u64().unwrap() as u32,
                        depth_or_array_layers: sz[2].as_u64().unwrap() as u32,
                    };
                    let fmt = format(s(o, "format", ""));
                    let tex = device.create_texture(&TextureDescriptor {
                        label: Some(s(o, "label", "")),
                        size,
                        mip_level_count: n(o, "mips", 1) as u32,
                        sample_count: n(o, "samples", 1) as u32,
                        dimension: match s(o, "dimension", "2d") {
                            "1d" => TextureDimension::D1,
                            "3d" => TextureDimension::D3,
                            _ => TextureDimension::D2,
                        },
                        format: fmt,
                        usage: TextureUsages::from_bits_truncate(n(o, "usage", 0) as u32),
                        view_formats: &[],
                    });
                    for w in o["writes"].as_array().unwrap() {
                        let org = &w["origin"];
                        let wsz = &w["size"];
                        self.queue.write_texture(
                            TexelCopyTextureInfo {
                                texture: &tex,
                                mip_level: n(w, "mip", 0) as u32,
                                origin: Origin3d {
                                    x: org[0].as_u64().unwrap() as u32,
                                    y: org[1].as_u64().unwrap() as u32,
                                    z: org[2].as_u64().unwrap() as u32,
                                },
                                aspect: TextureAspect::All,
                            },
                            cap.blob(w),
                            TexelCopyBufferLayout {
                                offset: 0,
                                bytes_per_row: id(w, "bytesPerRow").map(|x| x as u32),
                                rows_per_image: id(w, "rowsPerImage").map(|x| x as u32),
                            },
                            Extent3d {
                                width: wsz[0].as_u64().unwrap() as u32,
                                height: wsz[1].as_u64().unwrap() as u32,
                                depth_or_array_layers: wsz[2].as_u64().unwrap() as u32,
                            },
                        );
                    }
                    textures.insert(*oid, Some(tex));
                }
                _ => {}
            }
        }
        for &oid in &ids {
            let o = objects[oid];
            match o["kind"].as_str().unwrap() {
                "view" => {
                    let tex = textures.get(&o["texture"].as_u64().unwrap()).expect("view of an unrecorded texture");
                    match tex {
                        None => {
                            view_ix.insert(*oid, None);
                        }
                        Some(t) => {
                            let d = &o["desc"];
                            let desc = TextureViewDescriptor {
                                format: d.get("format").and_then(|x| x.as_str()).map(format),
                                dimension: d.get("dimension").and_then(|x| x.as_str()).map(view_dimension),
                                base_mip_level: n(d, "baseMipLevel", 0) as u32,
                                mip_level_count: id(d, "mipLevelCount").map(|x| x as u32),
                                base_array_layer: n(d, "baseArrayLayer", 0) as u32,
                                array_layer_count: id(d, "arrayLayerCount").map(|x| x as u32),
                                ..Default::default()
                            };
                            view_ix.insert(*oid, Some(views.len()));
                            views.push(t.create_view(&desc));
                        }
                    }
                }
                "sampler" => {
                    let d = &o["desc"];
                    let sampler = device.create_sampler(&SamplerDescriptor {
                        label: None,
                        address_mode_u: kebab(s(d, "addressModeU", "clamp-to-edge")),
                        address_mode_v: kebab(s(d, "addressModeV", "clamp-to-edge")),
                        address_mode_w: kebab(s(d, "addressModeW", "clamp-to-edge")),
                        mag_filter: kebab(s(d, "magFilter", "nearest")),
                        min_filter: kebab(s(d, "minFilter", "nearest")),
                        mipmap_filter: kebab(s(d, "mipmapFilter", "nearest")),
                        lod_min_clamp: f(d, "lodMinClamp", 0.0) as f32,
                        lod_max_clamp: f(d, "lodMaxClamp", 32.0) as f32,
                        compare: d.get("compare").and_then(|x| x.as_str()).map(kebab),
                        anisotropy_clamp: n(d, "maxAnisotropy", 1) as u16,
                        border_color: None,
                    });
                    samplers.insert(*oid, sampler);
                }
                "bgl" => {
                    let entries: Vec<BindGroupLayoutEntry> = o["entries"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|e| BindGroupLayoutEntry {
                            binding: n(e, "binding", 0) as u32,
                            visibility: ShaderStages::from_bits_truncate(n(e, "visibility", 0) as u32),
                            ty: binding_type(e),
                            count: None,
                        })
                        .collect();
                    bgls.insert(*oid, device.create_bind_group_layout(&BindGroupLayoutDescriptor { label: Some(s(o, "label", "")), entries: &entries }));
                }
                "module" => {
                    let code = shaders::assemble(o);
                    let scope = device.push_error_scope(ErrorFilter::Validation);
                    let m = device.create_shader_module(ShaderModuleDescriptor { label: Some(s(o, "label", "")), source: ShaderSource::Wgsl(code.into()) });
                    if let Some(e) = pollster::block_on(scope.pop()) {
                        errors.push(format!("module {}: {e}", s(o, "label", "")));
                    }
                    modules.insert(*oid, m);
                }
                _ => {}
            }
        }
        let mut group_ix = HashMap::new();
        let mut groups = Vec::new();
        let mut pipe_ix = HashMap::new();
        let mut pipelines = Vec::new();
        let mut pipeline_labels = Vec::new();
        for &oid in &ids {
            let o = objects[oid];
            match o["kind"].as_str().unwrap() {
                "bg" => {
                    let entries: Vec<BindGroupEntry> = o["entries"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|e| BindGroupEntry {
                            binding: n(e, "binding", 0) as u32,
                            resource: if let Some(bid) = id(e, "buffer") {
                                BindingResource::Buffer(BufferBinding {
                                    buffer: &buffers[buffer_ix[&bid]],
                                    offset: n(e, "offset", 0),
                                    size: id(e, "size").and_then(BufferSize::new),
                                })
                            } else if let Some(vid) = id(e, "view") {
                                BindingResource::TextureView(&views[view_ix[&vid].expect("canvas bound as a texture")])
                            } else {
                                BindingResource::Sampler(&samplers[&id(e, "sampler").unwrap()])
                            },
                        })
                        .collect();
                    let g = device.create_bind_group(&BindGroupDescriptor { label: Some(s(o, "label", "")), layout: &bgls[&o["layout"].as_u64().unwrap()], entries: &entries });
                    group_ix.insert(*oid, groups.len());
                    groups.push(g);
                }
                "pipeline" => {
                    let layout = o["layout"].as_u64().map(|pl| {
                        let pl = objects[&pl];
                        let layouts: Vec<Option<&BindGroupLayout>> = pl["layouts"].as_array().unwrap().iter().map(|l| Some(&bgls[&l.as_u64().unwrap()])).collect();
                        device.create_pipeline_layout(&PipelineLayoutDescriptor { label: None, bind_group_layouts: &layouts, immediate_size: 0 })
                    });
                    let v = &o["vertex"];
                    let attrs: Vec<Vec<VertexAttribute>> = v["buffers"]
                        .as_array()
                        .map(|a| a.as_slice())
                        .unwrap_or(&[])
                        .iter()
                        .map(|bl| {
                            bl["attributes"]
                                .as_array()
                                .unwrap()
                                .iter()
                                .map(|a| VertexAttribute { format: vertex_format(s(a, "format", "")), offset: n(a, "offset", 0), shader_location: n(a, "shaderLocation", 0) as u32 })
                                .collect()
                        })
                        .collect();
                    let vbufs: Vec<Option<VertexBufferLayout>> = v["buffers"]
                        .as_array()
                        .map(|a| a.as_slice())
                        .unwrap_or(&[])
                        .iter()
                        .zip(&attrs)
                        .map(|(bl, at)| {
                            Some(VertexBufferLayout {
                                array_stride: n(bl, "arrayStride", 0),
                                step_mode: if s(bl, "stepMode", "vertex") == "instance" { VertexStepMode::Instance } else { VertexStepMode::Vertex },
                                attributes: at,
                            })
                        })
                        .collect();
                    let fr = &o["fragment"];
                    let targets: Vec<Option<ColorTargetState>> = fr["targets"]
                        .as_array()
                        .map(|a| a.as_slice())
                        .unwrap_or(&[])
                        .iter()
                        .map(|t| {
                            let fmt = s(t, "format", "");
                            Some(ColorTargetState {
                                format: if fmt == s(&cap.manifest["canvas"], "format", "") { self.canvas_format } else { format(fmt) },
                                blend: t.get("blend").filter(|x| !x.is_null()).map(|bl| BlendState { color: blend_component(&bl["color"]), alpha: blend_component(&bl["alpha"]) }),
                                write_mask: ColorWrites::from_bits_truncate(n(t, "writeMask", 0xf) as u32),
                            })
                        })
                        .collect();
                    let ds = &o["depthStencil"];
                    let depth_stencil = (!ds.is_null()).then(|| DepthStencilState {
                        format: format(s(ds, "format", "")),
                        depth_write_enabled: Some(b(ds, "depthWriteEnabled")),
                        depth_compare: ds.get("depthCompare").and_then(|x| x.as_str()).map(kebab),
                        stencil: StencilState {
                            front: stencil_face(&ds["stencilFront"]),
                            back: stencil_face(&ds["stencilBack"]),
                            read_mask: n(ds, "stencilReadMask", 0xffff_ffff) as u32,
                            write_mask: n(ds, "stencilWriteMask", 0xffff_ffff) as u32,
                        },
                        bias: DepthBiasState::default(),
                    });
                    let pr = &o["primitive"];
                    let label = s(o, "label", "").to_string();
                    let scope = device.push_error_scope(ErrorFilter::Validation);
                    let p = device.create_render_pipeline(&RenderPipelineDescriptor {
                        label: Some(&label),
                        layout: layout.as_ref(),
                        vertex: VertexState {
                            module: &modules[&v["module"].as_u64().unwrap()],
                            entry_point: v.get("entryPoint").and_then(|x| x.as_str()),
                            compilation_options: Default::default(),
                            buffers: &vbufs,
                        },
                        primitive: PrimitiveState {
                            topology: kebab(s(pr, "topology", "triangle-list")),
                            cull_mode: match s(pr, "cullMode", "none") {
                                "front" => Some(Face::Front),
                                "back" => Some(Face::Back),
                                _ => None,
                            },
                            front_face: kebab(s(pr, "frontFace", "ccw")),
                            ..Default::default()
                        },
                        depth_stencil,
                        multisample: MultisampleState::default(),
                        fragment: (!fr.is_null()).then(|| FragmentState {
                            module: &modules[&fr["module"].as_u64().unwrap()],
                            entry_point: fr.get("entryPoint").and_then(|x| x.as_str()),
                            compilation_options: Default::default(),
                            targets: &targets,
                        }),
                        multiview_mask: None,
                        cache: None,
                    });
                    if let Some(e) = pollster::block_on(scope.pop()) {
                        errors.push(format!("pipeline {label}: {e}"));
                    }
                    pipe_ix.insert(*oid, pipelines.len());
                    pipelines.push(p);
                    pipeline_labels.push(label);
                }
                _ => {}
            }
        }
        let mut ops = Vec::new();
        let mut passes = 0;
        for o in cap.ops() {
            let op = match o["op"].as_str().unwrap() {
                "beginPass" => {
                    passes += 1;
                    let color = o["color"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|a| {
                            let vid = a["view"].as_u64().unwrap();
                            let c = &a["clearValue"];
                            let clear = (s(a, "loadOp", "load") == "clear").then(|| {
                                if c.is_array() {
                                    Color { r: c[0].as_f64().unwrap_or(0.0), g: c[1].as_f64().unwrap_or(0.0), b: c[2].as_f64().unwrap_or(0.0), a: c[3].as_f64().unwrap_or(0.0) }
                                } else {
                                    Color { r: f(c, "r", 0.0), g: f(c, "g", 0.0), b: f(c, "b", 0.0), a: f(c, "a", 0.0) }
                                }
                            });
                            ColorAtt { target: view_ix[&vid].map(Target::View).unwrap_or(Target::Canvas), clear, store: store(a, "storeOp") }
                        })
                        .collect();
                    let d = &o["depth"];
                    let depth = (!d.is_null()).then(|| DepthAtt {
                        view: view_ix[&d["view"].as_u64().unwrap()].unwrap(),
                        depth: d.get("depthLoadOp").and_then(|x| x.as_str()).map(|l| ((l == "clear").then(|| f(d, "depthClearValue", 1.0) as f32), store(d, "depthStoreOp"))),
                        stencil: d.get("stencilLoadOp").and_then(|x| x.as_str()).map(|l| ((l == "clear").then(|| n(d, "stencilClearValue", 0) as u32), store(d, "stencilStoreOp"))),
                    });
                    Op::Begin { label: s(o, "label", "").to_string(), color, depth }
                }
                "setPipeline" => Op::Pipeline(pipe_ix[&o["pipeline"].as_u64().unwrap()]),
                "setBindGroup" => Op::BindGroup(
                    n(o, "index", 0) as u32,
                    group_ix[&o["group"].as_u64().unwrap()],
                    o["offsets"].as_array().unwrap().iter().map(|x| x.as_u64().unwrap() as u32).collect(),
                ),
                "setVertexBuffer" => Op::Vertex(n(o, "slot", 0) as u32, buffer_ix[&o["buffer"].as_u64().unwrap()], n(o, "offset", 0), id(o, "size")),
                "setIndexBuffer" => Op::Index(
                    buffer_ix[&o["buffer"].as_u64().unwrap()],
                    if s(o, "format", "uint16") == "uint32" { IndexFormat::Uint32 } else { IndexFormat::Uint16 },
                    n(o, "offset", 0),
                    id(o, "size"),
                ),
                "setStencilReference" => Op::Stencil(n(o, "ref", 0) as u32),
                "setViewport" => {
                    let a = &o["args"];
                    Op::Viewport(std::array::from_fn(|i| a[i].as_f64().unwrap() as f32))
                }
                "setScissorRect" => {
                    let a = &o["args"];
                    Op::Scissor(std::array::from_fn(|i| a[i].as_u64().unwrap() as u32))
                }
                "draw" => Op::Draw(n(o, "vertexCount", 0) as u32, n(o, "instanceCount", 1) as u32, n(o, "firstVertex", 0) as u32, n(o, "firstInstance", 0) as u32),
                "drawIndexed" => Op::DrawIndexed(
                    n(o, "indexCount", 0) as u32,
                    n(o, "instanceCount", 1) as u32,
                    n(o, "firstIndex", 0) as u32,
                    o["baseVertex"].as_i64().unwrap_or(0) as i32,
                    n(o, "firstInstance", 0) as u32,
                ),
                "endPass" => Op::End,
                _ => continue,
            };
            ops.push(op);
        }
        Scene { buffers, views, groups, pipelines, pipeline_labels, ops, passes, errors }
    }
}

impl Scene {
    pub fn skip(&mut self, labels: &[String]) {
        let mut current = None;
        let ops = std::mem::take(&mut self.ops);
        self.ops = ops
            .into_iter()
            .filter(|op| {
                if let Op::Pipeline(p) = op {
                    current = Some(*p);
                }
                let skipped = current.is_some_and(|p| labels.contains(&self.pipeline_labels[p]));
                !(skipped && matches!(op, Op::Draw(..) | Op::DrawIndexed(..)))
            })
            .collect();
    }

    pub fn encode(&self, encoder: &mut CommandEncoder, canvas: &TextureView, queries: Option<&QuerySet>, only_clear: bool) -> usize {
        let mut pass: Option<RenderPass<'static>> = None;
        let mut index = 0u32;
        for op in &self.ops {
            match op {
                Op::Begin { label, color, depth } => {
                    let colors: Vec<Option<RenderPassColorAttachment>> = color
                        .iter()
                        .map(|c| {
                            Some(RenderPassColorAttachment {
                                view: match c.target {
                                    Target::Canvas => canvas,
                                    Target::View(v) => &self.views[v],
                                },
                                depth_slice: None,
                                resolve_target: None,
                                ops: Operations { load: c.clear.map(LoadOp::Clear).unwrap_or(LoadOp::Load), store: c.store },
                            })
                        })
                        .collect();
                    let ds = depth.as_ref().map(|d| RenderPassDepthStencilAttachment {
                        view: &self.views[d.view],
                        depth_ops: d.depth.map(|(c, st)| Operations { load: c.map(LoadOp::Clear).unwrap_or(LoadOp::Load), store: st }),
                        stencil_ops: d.stencil.map(|(c, st)| Operations { load: c.map(LoadOp::Clear).unwrap_or(LoadOp::Load), store: st }),
                    });
                    let p = encoder.begin_render_pass(&RenderPassDescriptor {
                        label: Some(label),
                        color_attachments: &colors,
                        depth_stencil_attachment: ds,
                        timestamp_writes: queries.map(|q| RenderPassTimestampWrites { query_set: q, beginning_of_pass_write_index: Some(index * 2), end_of_pass_write_index: Some(index * 2 + 1) }),
                        occlusion_query_set: None,
                        multiview_mask: None,
                    });
                    index += 1;
                    pass = Some(p.forget_lifetime());
                }
                Op::End => {
                    pass = None;
                }
                _ if only_clear => {}
                Op::Pipeline(p) => pass.as_mut().unwrap().set_pipeline(&self.pipelines[*p]),
                Op::BindGroup(i, g, offs) => pass.as_mut().unwrap().set_bind_group(*i, &self.groups[*g], offs),
                Op::Vertex(slot, bix, off, size) => {
                    let buf = &self.buffers[*bix];
                    let slice = match size {
                        Some(sz) => buf.slice(*off..*off + *sz),
                        None => buf.slice(*off..),
                    };
                    pass.as_mut().unwrap().set_vertex_buffer(*slot, slice);
                }
                Op::Index(bix, fmt, off, size) => {
                    let buf = &self.buffers[*bix];
                    let slice = match size {
                        Some(sz) => buf.slice(*off..*off + *sz),
                        None => buf.slice(*off..),
                    };
                    pass.as_mut().unwrap().set_index_buffer(slice, *fmt);
                }
                Op::Stencil(r) => pass.as_mut().unwrap().set_stencil_reference(*r),
                Op::Viewport(v) => pass.as_mut().unwrap().set_viewport(v[0], v[1], v[2], v[3], v[4], v[5]),
                Op::Scissor(r) => pass.as_mut().unwrap().set_scissor_rect(r[0], r[1], r[2], r[3]),
                Op::Draw(vc, ic, fv, fi) => pass.as_mut().unwrap().draw(*fv..*fv + *vc, *fi..*fi + *ic),
                Op::DrawIndexed(ic, inst, fi, bv, finst) => pass.as_mut().unwrap().draw_indexed(*fi..*fi + *ic, *bv, *finst..*finst + *inst),
            }
        }
        drop(pass);
        index as usize
    }
}
