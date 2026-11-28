import type { GameState } from '$lib/game/core/types';
import { PAINTED_TILES } from '$lib/webgl/painted/flag';

export interface BuildInfo {
  commit: string;
  sha: string;
  branch: string;
  refs: string;
  dirty: number;
  serverStarted: string;
}

export interface ClientInfo {
  shell: string;
  query: string;
  switches: string;
  gpu: string;
  window: string;
  screen: string;
  cores: number;
  memoryGb: number | null;
}

const RENDER_SWITCH = /^fantasia4x-(painted|ground)/;

function quoted(value: string): string {
  return `"${value.replace(/"/g, "'")}"`;
}

export function readClientInfo(): ClientInfo {
  let gpu = 'none';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl) gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    gpu = 'unavailable';
  }
  let switches = '';
  try {
    switches = Object.keys(localStorage)
      .filter((k) => RENDER_SWITCH.test(k))
      .sort()
      .map((k) => `${k.replace('fantasia4x-', '')}=${localStorage.getItem(k)}`)
      .join(',');
  } catch {
    switches = 'unavailable';
  }
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return {
    shell: navigator.userAgent.includes('Fantasia4xShell') ? 'electron' : 'browser',
    query: location.search,
    switches,
    gpu,
    window: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
    screen: `${screen.width}x${screen.height}`,
    cores: navigator.hardwareConcurrency ?? 0,
    memoryGb: memory ?? null
  };
}

export function sessionHeaderLine(
  build: BuildInfo,
  version: string,
  mode: string,
  painted: boolean,
  client: ClientInfo,
  gs: GameState,
  speed: number
): string {
  const map = `${gs.worldMap?.[0]?.length ?? 0}x${gs.worldMap?.length ?? 0}`;
  return [
    'session',
    `build=${build.branch}@${build.commit}`,
    `refs=${build.refs || '-'}`,
    `dirty=${build.dirty}`,
    `version=${version}`,
    `mode=${mode}`,
    `serverStarted=${build.serverStarted}`,
    `shell=${client.shell}`,
    `renderer=${painted ? 'painted' : 'glyph'}`,
    `query=${client.query || '-'}`,
    `switches=${client.switches || '-'}`,
    `gpu=${quoted(client.gpu)}`,
    `window=${client.window}`,
    `screen=${client.screen}`,
    `cores=${client.cores}`,
    `memoryGb=${client.memoryGb ?? '-'}`,
    `map=${map}`,
    `pawns=${gs.pawns?.length ?? 0}`,
    `mobs=${gs.mobs?.length ?? 0}`,
    `buildings=${gs.buildings?.length ?? 0}`,
    `drops=${gs.droppedItems?.length ?? 0}`,
    `jobs=${gs.jobs?.length ?? 0}`,
    `turn=${gs.turn}`,
    `speed=${speed}x`
  ].join(' ');
}

export function describeSession(gs: GameState, speed: number): string {
  return sessionHeaderLine(
    __F4X_BUILD__,
    __APP_VERSION__,
    import.meta.env.VITE_DEBUG_MODE === 'true' ? 'debug' : 'play',
    PAINTED_TILES,
    readClientInfo(),
    gs,
    speed
  );
}
