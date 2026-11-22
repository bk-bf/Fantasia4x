import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';

export interface FakeAudioConfig {
  fetchMs: number;
  decodeMs: number;
  canplayMs: number;
  sfxDurS: number;
  sampleRate: number;
}

const STATIC = join(process.cwd(), 'static');

let t0 = Date.now();
export const now = (): number => Date.now() - t0;

export const timeline: { t: number; what: string }[] = [];
const mark = (what: string): void => void timeline.push({ t: now(), what });

export const sourceStarts: { url: string; t: number }[] = [];
export const htmlNodes: FakeAudio[] = [];
export const counters = { rafFrames: 0, gainSets: 0 };
const docListeners: Record<string, ((e: unknown) => void)[]> = {};

export function resetRecords(): void {
  t0 = Date.now();
  timeline.length = 0;
  sourceStarts.length = 0;
  counters.rafFrames = 0;
  counters.gainSets = 0;
}

class FakeParam {
  value = 1;
  setValueAtTime(v: number) {
    this.value = v;
    counters.gainSets++;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
  }
  setTargetAtTime(v: number) {
    this.value = v;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  connected = false;
  connect() {
    this.connected = true;
  }
  disconnect() {
    this.connected = false;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeSource extends FakeNode {
  buffer: { url?: string; scratch?: boolean; duration: number } | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new FakeParam();
  onended: (() => void) | null = null;
  stopped = false;
  start() {
    if (this.buffer?.scratch) {
      setTimeout(() => this.onended?.(), 0);
      return;
    }
    sourceStarts.push({ url: this.buffer?.url ?? '?', t: now() });
    mark(`source start ${this.buffer?.url}`);
  }
  stop() {
    this.stopped = true;
  }
}

export class FakeAudio {
  static cfg: FakeAudioConfig;
  readyState = 0;
  paused = true;
  volume = 1;
  muted = false;
  preload = 'auto';
  currentTime = 0;
  playbackRate = 1;
  duration = 120;
  oncanplaythrough = null;
  src = '';
  private listeners: Record<string, (() => void)[]> = {};
  private loadTimer: ReturnType<typeof setTimeout> | undefined;
  constructor() {
    htmlNodes.push(this);
  }
  canPlayType(t: string) {
    return /ogg|mpeg|wav|webm|mp4|aac|flac|m4a/.test(t) ? 'probably' : '';
  }
  addEventListener(e: string, f: () => void) {
    (this.listeners[e] ??= []).push(f);
  }
  removeEventListener(e: string, f: () => void) {
    this.listeners[e] = (this.listeners[e] ?? []).filter((x) => x !== f);
  }
  load() {
    if (!this.src || this.src.startsWith('data:')) return;
    mark(`html5 load ${this.src}`);
    this.readyState = 0;
    this.paused = true;
    clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => {
      this.readyState = 4;
      for (const f of [...(this.listeners.canplaythrough ?? [])]) f();
    }, FakeAudio.cfg.canplayMs);
  }
  play() {
    if (this.src && !this.src.startsWith('data:')) {
      this.paused = false;
      mark(`html5 play ${this.src}`);
    }
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  end() {
    this.paused = true;
    for (const f of [...(this.listeners.ended ?? [])]) f();
  }
}

export class FakeContext {
  static cfg: FakeAudioConfig;
  static all: FakeContext[] = [];
  state = 'suspended';
  currentTime = 0;
  sampleRate: number;
  destination = {};
  closed = false;
  constructor() {
    this.sampleRate = FakeContext.cfg.sampleRate;
    FakeContext.all.push(this);
    mark(`context new ${FakeContext.all.length}`);
  }
  createGain() {
    return new FakeGain();
  }
  createBuffer() {
    return { scratch: true, duration: 0 };
  }
  createBufferSource() {
    return new FakeSource();
  }
  decodeAudioData(buf: { url: string }, ok: (b: unknown) => void) {
    setTimeout(() => {
      mark(`decoded ${buf.url}`);
      const duration = buf.url.includes('/ambient/') ? 60 : FakeContext.cfg.sfxDurS;
      ok({ url: buf.url, duration });
    }, FakeContext.cfg.decodeMs);
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    this.state = 'closed';
    mark(`context close ${FakeContext.all.indexOf(this) + 1}`);
    return Promise.resolve();
  }
}

class FakeXHR {
  static cfg: FakeAudioConfig;
  url = '';
  status = 0;
  response: unknown = null;
  responseType = '';
  withCredentials = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  headers: Record<string, string> = {};
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send() {
    mark(`fetch ${this.url}`);
    setTimeout(() => {
      this.status = existsSync(join(STATIC, this.url)) ? 200 : 404;
      this.response = { url: this.url };
      this.onload?.();
    }, FakeXHR.cfg.fetchMs);
  }
}

export function installAudioFakes(cfg: FakeAudioConfig): void {
  FakeAudio.cfg = cfg;
  FakeContext.cfg = cfg;
  FakeXHR.cfg = cfg;
  const g = globalThis as Record<string, unknown>;
  g.window = globalThis;
  g.location = { protocol: 'http:' };
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0',
      appVersion: '5.0',
      platform: 'Linux x86_64',
      vendor: 'Google Inc.'
    },
    configurable: true
  });
  g.Audio = FakeAudio;
  g.AudioContext = FakeContext;
  g.XMLHttpRequest = FakeXHR;
  g.document = {
    addEventListener(e: string, f: (e: unknown) => void) {
      (docListeners[e] ??= []).push(f);
    },
    removeEventListener(e: string, f: (e: unknown) => void) {
      docListeners[e] = (docListeners[e] ?? []).filter((x) => x !== f);
    }
  };
  g.requestAnimationFrame = (cb: (ts: number) => void) =>
    setTimeout(() => {
      counters.rafFrames++;
      cb(performance.now());
    }, 16) as unknown as number;
  g.cancelAnimationFrame = (id: number) =>
    clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
}

export function dispatchDoc(e: string): void {
  mark(`document ${e}`);
  for (const f of [...(docListeners[e] ?? [])]) f({ type: e });
}

export async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}
