import { idbGet, metaKey, saveKey, worldKey } from './saveDb';
import { encodeSave, type LedgerCaptureMeta } from '$lib/game/sim/ledgerCapture';
import { packSave, uploadSave } from '$lib/game/sim/ledgerPack';
import type { ExportReply } from './hiddenSaves';

interface StoredSave {
  turn?: number;
  seed?: number;
  pawns?: unknown[];
  mobs?: unknown[];
  generatedBy?: { commit?: string };
  worldMap?: unknown[][];
}

async function exportSave(id: string): Promise<ExportReply> {
  const stored = await idbGet<StoredSave>(saveKey(id));
  if (!stored) throw new Error('no such save');
  const { worldMap: embedded, ...dynamic } = stored;
  const world = (await idbGet<unknown[][]>(worldKey(id))) ?? embedded;
  if (!world) throw new Error('the save has no world');
  const meta = await idbGet<{ savedBy?: { commit?: string } }>(metaKey(id));
  const at = new Date().toISOString();
  const started = performance.now();
  const save = encodeSave(dynamic, world);
  const ms = Math.round(performance.now() - started);
  const capture: LedgerCaptureMeta = {
    captureId: `deleted-${id}`,
    session: 'deleted',
    sessionAt: at,
    reason: 'deleted',
    at,
    ms,
    turn: dynamic.turn ?? 0,
    seed: dynamic.seed ?? 0,
    map: `${world[0]?.length ?? 0}x${world.length}`,
    pawns: dynamic.pawns?.length ?? 0,
    mobs: dynamic.mobs?.length ?? 0,
    speed: null,
    save: id,
    scenario: null,
    generatedBy: dynamic.generatedBy?.commit ?? null,
    savedBy: meta?.savedBy?.commit ?? null
  };
  const packStart = performance.now();
  const packed = await packSave(save);
  const receipt = await uploadSave(packed, capture, Math.round(performance.now() - packStart));
  if (!receipt.entry) throw new Error('the ledger spool was busy');
  return { id, blob: packed.blob, entry: receipt.entry };
}

self.onmessage = async ({ data }: MessageEvent<{ id: string }>) => {
  let reply: ExportReply;
  try {
    reply = await exportSave(data.id);
  } catch (err) {
    reply = { id: data.id, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(reply);
};
