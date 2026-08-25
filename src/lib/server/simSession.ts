import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario, type ScenarioSpec } from '$lib/game/headless/Scenario';
import { SCENARIO_PRESETS, getScenarioPreset } from '$lib/game/headless/scenarios/presets';
import { fromSnapshot, type HeadlessSnapshot } from '$lib/game/headless/snapshot';

let session: HeadlessSession | null = null;
let sessionLabel = '';

export function headlessEnabled(): boolean {
  return !!import.meta.env.DEV && import.meta.env.VITE_HEADLESS === '1';
}

export function guardHeadless(): Response | null {
  if (!headlessEnabled()) return new Response('not found', { status: 404 });
  return null;
}

export function listPresets(): Array<{ id: string; label: string; description: string }> {
  return SCENARIO_PRESETS.map(({ id, label, description }) => ({ id, label, description }));
}

export async function createSession(opts: {
  preset?: string;
  spec?: ScenarioSpec;
  snapshot?: HeadlessSnapshot;
}): Promise<{ session: HeadlessSession; label: string }> {
  let label: string;
  let state;
  if (opts.snapshot) {
    state = fromSnapshot(opts.snapshot);
    label = 'snapshot';
  } else if (opts.spec) {
    state = buildScenario(opts.spec);
    label = 'inline-spec';
  } else {
    const preset = getScenarioPreset(opts.preset ?? '');
    if (!preset) {
      throw new Error(
        `Unknown preset '${opts.preset}'. Available: ${SCENARIO_PRESETS.map((p) => p.id).join(', ')}`
      );
    }
    state = buildScenario(preset.spec);
    label = preset.id;
  }
  const next = new HeadlessSession();
  await next.start(state);
  session = next;
  sessionLabel = label;
  return { session: next, label };
}

export function currentSession(): { session: HeadlessSession; label: string } | null {
  return session ? { session, label: sessionLabel } : null;
}

export function disposeSession(): boolean {
  const had = session !== null;
  session = null;
  sessionLabel = '';
  return had;
}
