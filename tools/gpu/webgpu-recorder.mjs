export function webgpuRecorder() {
  if (!('GPUDevice' in window)) return;
  const R = {
    ids: new WeakMap(),
    next: 1,
    objs: new Map(),
    ops: [],
    recording: false,
    canvas: null
  };
  window.__nc = R;
  const id = (o) => {
    let i = R.ids.get(o);
    if (!i) {
      i = R.next++;
      R.ids.set(o, i);
    }
    return i;
  };
  const reg = (o, rec) => {
    R.objs.set(id(o), rec);
    return o;
  };
  const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
  const bytesOf = (data, dataOffset = 0, size) => {
    if (data instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer)) {
      return new Uint8Array(data, dataOffset, size ?? data.byteLength - dataOffset);
    }
    const el = data.BYTES_PER_ELEMENT ?? 1;
    const count = size ?? (data.byteLength / el - dataOffset);
    return new Uint8Array(data.buffer, data.byteOffset + dataOffset * el, count * el);
  };
  const extent = (s) => (Array.isArray(s) ? [s[0], s[1] ?? 1, s[2] ?? 1] : [s.width, s.height ?? 1, s.depthOrArrayLayers ?? 1]);
  const origin = (o) => (!o ? [0, 0, 0] : Array.isArray(o) ? [o[0] ?? 0, o[1] ?? 0, o[2] ?? 0] : [o.x ?? 0, o.y ?? 0, o.z ?? 0]);
  const wrap = (proto, name, fn) => {
    const orig = proto[name];
    if (!orig) return;
    proto[name] = function (...args) {
      return fn.call(this, orig, args);
    };
  };
  const D = GPUDevice.prototype;
  wrap(D, 'createBuffer', function (orig, [desc]) {
    const b = orig.call(this, desc);
    return reg(b, { kind: 'buffer', label: desc.label ?? '', size: desc.size, usage: desc.usage, shadow: new Uint8Array(desc.size) });
  });
  wrap(GPUBuffer.prototype, 'destroy', function (orig, args) {
    const rec = R.objs.get(R.ids.get(this));
    if (rec) R.objs.delete(R.ids.get(this));
    return orig.apply(this, args);
  });
  wrap(GPUQueue.prototype, 'writeBuffer', function (orig, args) {
    const [buffer, offset, data, dataOffset, size] = args;
    const rec = R.objs.get(R.ids.get(buffer));
    if (rec) rec.shadow.set(bytesOf(data, dataOffset, size), offset);
    return orig.apply(this, args);
  });
  wrap(D, 'createTexture', function (orig, [desc]) {
    const t = orig.call(this, desc);
    return reg(t, {
      kind: 'texture',
      label: desc.label ?? '',
      size: extent(desc.size),
      format: desc.format,
      usage: desc.usage,
      mips: desc.mipLevelCount ?? 1,
      samples: desc.sampleCount ?? 1,
      dimension: desc.dimension ?? '2d',
      writes: []
    });
  });
  wrap(GPUQueue.prototype, 'writeTexture', function (orig, args) {
    const [dst, data, layout, size] = args;
    const rec = R.objs.get(R.ids.get(dst.texture));
    if (rec) {
      const [w, h, d] = extent(size);
      const rows = layout.rowsPerImage ?? h;
      const all = bytesOf(data);
      const start = layout.offset ?? 0;
      const len = Math.min(all.length - start, (layout.bytesPerRow ?? 0) * rows * d || all.length - start);
      const write = { mip: dst.mipLevel ?? 0, origin: origin(dst.origin), size: [w, h, d], bytesPerRow: layout.bytesPerRow, rowsPerImage: rows, bytes: all.slice(start, start + len) };
      const same = (x) => x.mip === write.mip && String(x.origin) === String(write.origin) && String(x.size) === String(write.size);
      rec.writes = rec.writes.filter((x) => !same(x));
      rec.writes.push(write);
    }
    return orig.apply(this, args);
  });
  wrap(GPUTexture.prototype, 'createView', function (orig, [desc]) {
    const v = orig.call(this, desc);
    return reg(v, { kind: 'view', texture: id(this), desc: clone(desc) });
  });
  wrap(GPUCanvasContext.prototype, 'configure', function (orig, [conf]) {
    R.canvas = { format: conf.format, alphaMode: conf.alphaMode ?? 'opaque' };
    return orig.call(this, conf);
  });
  wrap(GPUCanvasContext.prototype, 'getCurrentTexture', function (orig, args) {
    const t = orig.apply(this, args);
    R.objs.set(id(t), { kind: 'texture', canvas: true, size: [t.width, t.height, 1], format: t.format, usage: t.usage });
    if (R.canvas) R.canvas.size = [t.width, t.height];
    return t;
  });
  wrap(D, 'createSampler', function (orig, [desc]) {
    return reg(orig.call(this, desc), { kind: 'sampler', desc: clone(desc) });
  });
  wrap(D, 'createBindGroupLayout', function (orig, [desc]) {
    return reg(orig.call(this, desc), { kind: 'bgl', label: desc.label ?? '', entries: clone(desc.entries) });
  });
  wrap(D, 'createPipelineLayout', function (orig, [desc]) {
    return reg(orig.call(this, desc), { kind: 'pl', layouts: desc.bindGroupLayouts.map(id) });
  });
  wrap(D, 'createShaderModule', function (orig, [desc]) {
    return reg(orig.call(this, desc), { kind: 'module', label: desc.label ?? '', code: desc.code });
  });
  const stage = (s) => (s ? { module: id(s.module), entryPoint: s.entryPoint, constants: clone(s.constants), buffers: clone(s.buffers), targets: clone(s.targets) } : null);
  const pipelineRec = (desc) => ({
    kind: 'pipeline',
    label: desc.label ?? '',
    layout: desc.layout === 'auto' ? 'auto' : id(desc.layout),
    vertex: stage(desc.vertex),
    fragment: stage(desc.fragment),
    primitive: clone(desc.primitive),
    depthStencil: clone(desc.depthStencil),
    multisample: clone(desc.multisample)
  });
  wrap(D, 'createRenderPipeline', function (orig, [desc]) {
    return reg(orig.call(this, desc), pipelineRec(desc));
  });
  wrap(D, 'createRenderPipelineAsync', function (orig, [desc]) {
    const rec = pipelineRec(desc);
    return orig.call(this, desc).then((p) => reg(p, rec));
  });
  const resource = (r) => {
    if (r instanceof GPUSampler) return { sampler: id(r) };
    if (r instanceof GPUTextureView) return { view: id(r) };
    if (r instanceof GPUBuffer) return { buffer: id(r) };
    return { buffer: id(r.buffer), offset: r.offset ?? 0, size: r.size ?? null };
  };
  wrap(D, 'createBindGroup', function (orig, [desc]) {
    return reg(orig.call(this, desc), {
      kind: 'bg',
      label: desc.label ?? '',
      layout: id(desc.layout),
      entries: desc.entries.map((e) => ({ binding: e.binding, ...resource(e.resource) }))
    });
  });
  const op = (o) => {
    if (R.recording) R.ops.push(o);
  };
  const attachment = (a) => (a ? { ...clone({ ...a, view: undefined, resolveTarget: undefined }), view: id(a.view) } : null);
  wrap(GPUCommandEncoder.prototype, 'beginRenderPass', function (orig, [desc]) {
    op({ op: 'beginPass', label: desc.label ?? '', color: desc.colorAttachments.map(attachment), depth: attachment(desc.depthStencilAttachment) });
    return orig.call(this, desc);
  });
  const P = GPURenderPassEncoder.prototype;
  wrap(P, 'setPipeline', function (orig, [p]) {
    op({ op: 'setPipeline', pipeline: id(p) });
    return orig.call(this, p);
  });
  wrap(P, 'setBindGroup', function (orig, args) {
    const [index, group, offsets] = args;
    op({ op: 'setBindGroup', index, group: group ? id(group) : null, offsets: offsets ? Array.from(offsets) : [] });
    return orig.apply(this, args);
  });
  wrap(P, 'setVertexBuffer', function (orig, args) {
    const [slot, buffer, offset, size] = args;
    op({ op: 'setVertexBuffer', slot, buffer: buffer ? id(buffer) : null, offset: offset ?? 0, size: size ?? null });
    return orig.apply(this, args);
  });
  wrap(P, 'setIndexBuffer', function (orig, args) {
    const [buffer, format, offset, size] = args;
    op({ op: 'setIndexBuffer', buffer: id(buffer), format, offset: offset ?? 0, size: size ?? null });
    return orig.apply(this, args);
  });
  wrap(P, 'setStencilReference', function (orig, [ref]) {
    op({ op: 'setStencilReference', ref });
    return orig.call(this, ref);
  });
  wrap(P, 'setViewport', function (orig, args) {
    op({ op: 'setViewport', args: [...args] });
    return orig.apply(this, args);
  });
  wrap(P, 'setScissorRect', function (orig, args) {
    op({ op: 'setScissorRect', args: [...args] });
    return orig.apply(this, args);
  });
  wrap(P, 'draw', function (orig, args) {
    const [vertexCount, instanceCount, firstVertex, firstInstance] = args;
    op({ op: 'draw', vertexCount, instanceCount: instanceCount ?? 1, firstVertex: firstVertex ?? 0, firstInstance: firstInstance ?? 0 });
    return orig.apply(this, args);
  });
  wrap(P, 'drawIndexed', function (orig, args) {
    const [indexCount, instanceCount, firstIndex, baseVertex, firstInstance] = args;
    op({ op: 'drawIndexed', indexCount, instanceCount: instanceCount ?? 1, firstIndex: firstIndex ?? 0, baseVertex: baseVertex ?? 0, firstInstance: firstInstance ?? 0 });
    return orig.apply(this, args);
  });
  wrap(P, 'end', function (orig, args) {
    op({ op: 'endPass' });
    return orig.apply(this, args);
  });
  wrap(GPUQueue.prototype, 'submit', function (orig, args) {
    op({ op: 'submit' });
    return orig.apply(this, args);
  });
  R.record = (frames) =>
    new Promise((done) => {
      R.ops = [];
      R.recording = true;
      let n = 0;
      const tick = () => {
        R.ops.push({ op: 'frame' });
        if (++n > frames) {
          R.recording = false;
          done(R.ops.length);
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  R.frame = () => {
    const marks = R.ops.flatMap((o, i) => (o.op === 'frame' ? [i] : []));
    for (let k = marks.length - 2; k >= 0; k--) {
      const seg = R.ops.slice(marks[k] + 1, marks[k + 1]);
      if (seg.some((o) => o.op === 'draw' || o.op === 'drawIndexed')) return seg;
    }
    return [];
  };
  R.manifest = () => {
    const ops = R.frame();
    const used = new Set();
    const visit = (i) => {
      if (i === null || i === undefined || i === 'auto' || used.has(i)) return;
      const rec = R.objs.get(i);
      if (!rec) throw new Error(`object ${i} was never recorded`);
      used.add(i);
      if (rec.kind === 'view') visit(rec.texture);
      if (rec.kind === 'pl') rec.layouts.forEach(visit);
      if (rec.kind === 'bg') {
        visit(rec.layout);
        rec.entries.forEach((e) => visit(e.buffer ?? e.view ?? e.sampler));
      }
      if (rec.kind === 'pipeline') {
        visit(rec.layout);
        visit(rec.vertex?.module);
        visit(rec.fragment?.module);
      }
    };
    for (const o of ops) {
      visit(o.pipeline);
      visit(o.group);
      visit(o.buffer);
      o.color?.forEach((a) => visit(a?.view));
      visit(o.depth?.view);
    }
    const objects = [...used].sort((a, b) => a - b).map((i) => {
      const rec = R.objs.get(i);
      if (rec.kind === 'buffer') return { id: i, kind: 'buffer', label: rec.label, size: rec.size, usage: rec.usage };
      if (rec.kind === 'texture' && !rec.canvas)
        return { id: i, ...rec, writes: rec.writes.map((w, n) => ({ ...w, bytes: undefined, index: n, length: w.bytes.length })) };
      return { id: i, ...rec };
    });
    return JSON.stringify({ canvas: R.canvas, ops, objects, userAgent: navigator.userAgent });
  };
  R.chunk = async (objId, write, start, length) => {
    const rec = R.objs.get(objId);
    const src = write === null ? rec.shadow : rec.writes[write].bytes;
    const part = src.subarray(start, Math.min(src.length, start + length));
    const url = await new Promise((r) => {
      const fr = new FileReader();
      fr.onload = () => r(fr.result);
      fr.readAsDataURL(new Blob([part]));
    });
    return String(url).slice(String(url).indexOf(',') + 1);
  };
}

export function webgpuTimer() {
  if (!('GPUDevice' in window)) return;
  const T = { samples: [], pending: 0, enabled: false, frames: 0 };
  window.__ncTimer = T;
  const A = GPUAdapter.prototype;
  const requestDevice = A.requestDevice;
  A.requestDevice = function (desc = {}) {
    const want = this.features.has('timestamp-query') ? ['timestamp-query'] : [];
    T.supported = want.length > 0;
    return requestDevice.call(this, { ...desc, requiredFeatures: [...(desc.requiredFeatures ?? []), ...want] });
  };
  const encoders = new WeakMap();
  const pools = new WeakMap();
  const poolOf = (device) => {
    let p = pools.get(device);
    if (!p) {
      p = { qs: device.createQuerySet({ type: 'timestamp', count: 64 }), resolve: device.createBuffer({ size: 64 * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }), free: [] };
      pools.set(device, p);
    }
    return p;
  };
  const createCommandEncoder = GPUDevice.prototype.createCommandEncoder;
  GPUDevice.prototype.createCommandEncoder = function (...args) {
    const e = createCommandEncoder.apply(this, args);
    if (T.supported) encoders.set(e, { device: this, labels: [] });
    return e;
  };
  const beginRenderPass = GPUCommandEncoder.prototype.beginRenderPass;
  GPUCommandEncoder.prototype.beginRenderPass = function (desc) {
    const s = encoders.get(this);
    if (!s || !T.enabled || desc.timestampWrites || s.labels.length >= 32) return beginRenderPass.call(this, desc);
    const n = s.labels.length;
    s.labels.push(desc.label ?? `pass${n}`);
    return beginRenderPass.call(this, { ...desc, timestampWrites: { querySet: poolOf(s.device).qs, beginningOfPassWriteIndex: n * 2, endOfPassWriteIndex: n * 2 + 1 } });
  };
  const finish = GPUCommandEncoder.prototype.finish;
  const readbacks = new WeakMap();
  GPUCommandEncoder.prototype.finish = function (...args) {
    const s = encoders.get(this);
    if (s && s.labels.length) {
      const p = poolOf(s.device);
      const bytes = s.labels.length * 16;
      const rb = p.free.pop() ?? s.device.createBuffer({ size: 64 * 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      this.resolveQuerySet(p.qs, 0, s.labels.length * 2, p.resolve, 0);
      this.copyBufferToBuffer(p.resolve, 0, rb, 0, bytes);
      const cb = finish.apply(this, args);
      readbacks.set(cb, { rb, labels: s.labels, pool: p });
      return cb;
    }
    return finish.apply(this, args);
  };
  const submit = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (cbs) {
    const r = submit.call(this, cbs);
    for (const cb of cbs) {
      const rd = readbacks.get(cb);
      if (!rd) continue;
      T.pending++;
      rd.rb.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigInt64Array(rd.rb.getMappedRange(0, rd.labels.length * 16));
        const passes = rd.labels.map((label, i) => ({ label, ms: Number(t[i * 2 + 1] - t[i * 2]) / 1e6 }));
        rd.rb.unmap();
        rd.pool.free.push(rd.rb);
        T.pending--;
        if (T.enabled) T.samples.push(passes);
      });
    }
    return r;
  };
}
