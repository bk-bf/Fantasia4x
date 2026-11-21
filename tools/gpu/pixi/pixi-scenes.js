window.pixiScenes = async function pixiScenes({ W, H, ts, draws, capture }) {
  const P = window.PIXI;
  const MW = 500;
  const MH = 500;
  const CHUNK = 64;
  const BAND_ROWS = 8;
  const cols = Math.min(MW, Math.ceil(W / ts));
  const rows = Math.min(MH, Math.ceil(H / ts));

  const renderer = new P.WebGLRenderer();
  await renderer.init({ width: W, height: H, antialias: false, backgroundAlpha: 1, background: 0x000000, resolution: 1, autoDensity: false });
  const gl = renderer.gl;

  const source = (resource, width, height, format, addressMode) =>
    new P.BufferImageSource({ resource, width, height, format, addressMode, scaleMode: 'nearest', alphaMode: 'premultiplied-alpha' });
  const rnd = (n) => {
    const a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = Math.imul(i + 7, 2654435761) >>> 24;
    return a;
  };
  const atlasData = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const cx = (x & 31) - 15.5;
      const cy = (y & 31) - 15.5;
      const inside = cx * cx + cy * cy < 150;
      atlasData[i] = inside ? 60 + ((x * 7) & 127) : 0;
      atlasData[i + 1] = inside ? 90 + ((y * 5) & 127) : 0;
      atlasData[i + 2] = inside ? 50 : 0;
      atlasData[i + 3] = inside ? 255 : 0;
    }
  const idData = new Uint8Array(MW * MH);
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) idData[y * MW + x] = (Math.floor(x / 9) * 3 + Math.floor(y / 7) * 5) & 7;
  const atlas = source(atlasData, 256, 256, 'rgba8unorm', 'clamp-to-edge');
  const ids = source(idData, MW, MH, 'r8unorm', 'clamp-to-edge');
  const noise = source(rnd(64 * 64 * 4), 64, 64, 'rgba8unorm', 'repeat');
  const ground = source(rnd(512 * 64 * 4), 512, 64, 'rgba8unorm', 'repeat');
  const cells = [];
  for (let v = 0; v < 8; v++)
    for (let u = 0; u < 8; u++) cells.push(new P.Texture({ source: atlas, frame: new P.Rectangle(u * 32, v * 32, 32, 32) }));

  const terrain = [];
  const glyphs = [];
  const props = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const h = Math.imul((x * 73856093) ^ (y * 19349663), 2654435761) >>> 0;
      terrain.push({ x: x * ts, y: y * ts, w: ts, h: ts, u: h & 7, v: (h >> 3) & 7, r: 0.4, g: 0.6, b: 0.3, sway: 0, cx: x, cy: y });
      if ((h >>> 8) % 100 < 45) {
        const cell = { u: (h >> 6) & 7, v: (h >> 9) & 7, cx: x, cy: y };
        glyphs.push({ x: x * ts, y: y * ts, w: ts, h: ts, r: 0.8, g: 0.7, b: 0.3, sway: 0, ...cell });
        props.push({ x: x * ts - ts * 0.5, y: y * ts - ts * 2, w: ts * 2, h: ts * 3, r: 1, g: 1, b: 1, sway: ts * 0.08, ...cell });
      }
    }

  const VERTEX = `#version 300 es
    in vec2 aPosition; in vec2 aUV; in vec3 aColor; in float aSway;
    uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix; uniform float uTime;
    out vec2 vuv; out vec3 vc;
    void main() {
      vec2 q = aPosition + vec2(aSway * sin(uTime * 1.3 + aPosition.y * .05 + aPosition.x * .02), 0.);
      gl_Position = vec4((uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(q, 1.)).xy, 0., 1.);
      vuv = aUV; vc = aColor;
    }`;
  const fragment = (body) => `#version 300 es
    precision highp float;
    uniform sampler2D uAtlas; in vec2 vuv; in vec3 vc; out vec4 o;
    void main() { vec4 s = texture(uAtlas, vuv); ${body} }`;
  const clock = () => new P.UniformGroup({ uTime: { value: 0, type: 'f32' } });
  const quadShader = (body) => P.Shader.from({ gl: { vertex: VERTEX, fragment: fragment(body) }, resources: { uAtlas: atlas, clock: clock() } });
  const maskShader = quadShader('float l = dot(s.rgb, vec3(.299,.587,.114)); o = vec4(mix(vec3(.09,.07,.04), mix(vc*.3, vc, l), s.a), 1.);');
  const glyphShader = quadShader('float l = dot(s.rgb, vec3(.299,.587,.114)); o = vec4(mix(vc*.3, vc, l) * s.a, s.a);');
  const propShader = quadShader('o = vec4(s.rgb * vc, s.a);');

  const STRIDE = 32;
  const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
  function quadMesh(list, shader, blend) {
    const data = new Float32Array(list.length * 32);
    const index = new Uint16Array(list.length * 6);
    list.forEach((q, n) => {
      CORNERS.forEach(([dx, dy], c) => {
        data.set([q.x + dx * q.w, q.y + dy * q.h, (q.u + dx) / 8, (q.v + dy) / 8, q.r, q.g, q.b, dy ? 0 : q.sway], (n * 4 + c) * 8);
      });
      index.set([n * 4, n * 4 + 1, n * 4 + 2, n * 4, n * 4 + 2, n * 4 + 3], n * 6);
    });
    const buffer = new P.Buffer({ data, usage: P.BufferUsage.VERTEX | P.BufferUsage.COPY_DST });
    const attribute = (format, offset) => ({ buffer, format, stride: STRIDE, offset });
    const geometry = new P.Geometry({
      attributes: { aPosition: attribute('float32x2', 0), aUV: attribute('float32x2', 8), aColor: attribute('float32x3', 16), aSway: attribute('float32', 28) },
      indexBuffer: index
    });
    const mesh = new P.Mesh({ geometry, shader });
    mesh.state.blend = blend;
    return mesh;
  }
  const squareChunk = (q) => Math.floor(q.cy / CHUNK) * 1000 + Math.floor(q.cx / CHUNK);
  const rowBand = (q) => Math.floor(q.cy / BAND_ROWS);
  function chunked(list, shader, blend, chunkOf = squareChunk) {
    const layer = new P.Container();
    const chunks = new Map();
    for (const q of list) {
      const key = chunkOf(q);
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(q);
    }
    for (const key of [...chunks.keys()].sort((a, b) => a - b)) layer.addChild(quadMesh(chunks.get(key), shader, blend));
    return layer;
  }

  function spriteLayer() {
    const layer = new P.Container();
    const sprites = props.map((q) => {
      const sprite = new P.Sprite(cells[q.v * 8 + q.u]);
      sprite.anchor.set(0.5, 1);
      sprite.position.set(q.x + q.w / 2, q.y + q.h);
      sprite.scale.set(q.w / 32, q.h / 32);
      return layer.addChild(sprite);
    });
    return { layer, sprites };
  }
  function swaySprites(sprites, time) {
    for (let i = 0; i < sprites.length; i++) {
      const q = props[i];
      sprites[i].skew.x = -Math.atan2(q.sway * Math.sin(time * 1.3 + q.y * 0.05 + q.x * 0.02), q.h);
    }
  }

  function blendMesh() {
    const geometry = new P.Geometry({ attributes: { aPosition: [0, 0, W, 0, W, H, 0, H] }, indexBuffer: [0, 1, 2, 0, 2, 3] });
    const uniforms = new P.UniformGroup({ res: { value: new Float32Array([W, H]), type: 'vec2<f32>' }, ts: { value: ts, type: 'f32' }, t: { value: 0, type: 'f32' } });
    const shader = P.Shader.from({
      gl: {
        vertex: `#version 300 es
          in vec2 aPosition; uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix; uniform mat3 uTransformMatrix;
          void main() { gl_Position = vec4((uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.)).xy, 0., 1.); }`,
        fragment: `#version 300 es
          precision highp float;
          uniform sampler2D ids, nz, gr; uniform vec2 res; uniform float ts, t; out vec4 o;
          float idAt(vec2 w){ return texture(ids, (floor(w / ts) + .5) / vec2(500., 500.)).r * 255.; }
          vec3 ground(float id, vec2 w){ return texture(gr, vec2((id + fract(w / 64.).x) / 8., fract(w.y / 64.))).rgb; }
          void main(){ vec2 px = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y), w = px * (32. / ts);
            vec2 n1 = texture(nz, w / 256.).rg - .5, n2 = texture(nz, w / 61.).ba - .5; vec2 ww = w + n1 * 22. + n2 * 7.;
            float id = idAt(ww * ts / 32.), up = idAt((ww + vec2(0., -4.)) * ts / 32.), dn = idAt((ww + vec2(0., 4.)) * ts / 32.);
            vec3 c = ground(id, w); if (up > id) c *= .7; else if (dn < id) c *= .85;
            if (id < 1.5) c = mix(c, vec3(.1,.3,.5), .5 + .5 * sin(w.y * .3 - t * 2. + texture(nz, w / 97.).r * 6.));
            o = vec4(c, 1.); }`
      },
      resources: { ids, nz: noise, gr: ground, uniforms }
    });
    const mesh = new P.Mesh({ geometry, shader });
    mesh.state.blend = false;
    return { mesh, uniforms };
  }

  const scene = (build) => {
    const stage = new P.Container();
    const tick = build(stage);
    return { stage, tick };
  };
  const withSprites = (stage, animate) => {
    const { layer, sprites } = spriteLayer();
    stage.addChild(layer);
    return animate ? (time) => swaySprites(sprites, time) : () => {};
  };
  const withPropMeshes = (stage) => {
    stage.addChild(chunked(props, propShader, true, rowBand));
    return (time) => {
      propShader.resources.clock.uniforms.uTime = time;
    };
  };
  const withBlend = (stage) => {
    const { mesh, uniforms } = blendMesh();
    stage.addChild(mesh);
    return (time) => {
      uniforms.uniforms.t = time;
    };
  };
  const both = (a, b) => (time) => {
    a(time);
    b(time);
  };
  const SCENES = {
    today: (stage) => {
      stage.addChild(chunked(terrain, maskShader, false), chunked(glyphs, glyphShader, true));
      return () => {};
    },
    sprites: (stage) => {
      stage.addChild(chunked(terrain, maskShader, false));
      return withSprites(stage, true);
    },
    spritesStatic: (stage) => {
      stage.addChild(chunked(terrain, maskShader, false));
      return withSprites(stage, false);
    },
    spritesMesh: (stage) => {
      stage.addChild(chunked(terrain, maskShader, false));
      return withPropMeshes(stage);
    },
    blend: (stage) => withBlend(stage),
    full: (stage) => both(withBlend(stage), withSprites(stage, true)),
    fullMesh: (stage) => both(withBlend(stage), withPropMeshes(stage))
  };

  const px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const out = { W, H, ts, tiles: cols * rows, spriteCount: props.length, pixi: P.VERSION };
  for (const [name, build] of Object.entries(SCENES)) {
    const { stage, tick } = scene(build);
    for (let i = 0; i < 5; i++) {
      tick(i);
      renderer.render(stage);
      sync();
    }
    const t0 = performance.now();
    for (let i = 0; i < draws; i++) {
      tick(i * 0.016);
      renderer.render(stage);
      sync();
    }
    out[name] = +((performance.now() - t0) / draws).toFixed(2);
    if (capture === name) out.image = renderer.canvas.toDataURL('image/png');
    stage.destroy({ children: true });
  }
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  out.renderer = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  out.err = gl.getError();
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return out;
};
