import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { carriedQuantities, carrierOf } from '$lib/game/core/rules/gear/vessels';
import type { Pawn } from '$lib/game/core/types';

describe('a fluid medicine on a caretaker', () => {
  it('survives pickup, is found by the panel search, and is spent when administered', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 5,
        map: { w: 14, h: 14 },
        workReady: true,
        researchMaxTier: 9,
        toolTier: 3,
        pawns: [{ count: 4, skillLevel: 20 }],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        buildings: [{ id: 'apothecary' }],
        items: { glassware: 6, antivenin_tonic: 3, spit_meat: 10 },
        seedEntities: false
      })
    );
    const st = () => s.getState();
    const near = (a?: { x: number; y: number }, b?: { x: number; y: number }) =>
      !!a && !!b && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;

    let carer: Pawn | undefined, patient: Pawn | undefined, phialId: string | undefined;
    for (let i = 0; i < 60; i++) {
      s.tick(100);
      const ps = st().pawns as Pawn[];
      const pair = ps.flatMap((a) =>
        ps.filter((b) => b.id !== a.id && near(a.position, b.position)).map((b) => [a, b])
      )[0];
      const drops =
        (
          st() as unknown as {
            droppedItems?: Array<{
              id: string;
              instance?: { contents?: Array<{ itemId: string }> };
            }>;
          }
        ).droppedItems ?? [];
      const ph = drops.find((d) =>
        (d.instance?.contents ?? []).some((e) => e.itemId === 'antivenin_tonic')
      );
      if (pair && ph) {
        [carer, patient] = pair;
        phialId = ph.id;
        break;
      }
    }
    expect(carer && patient && phialId, 'two pawns together and a phial in stock').toBeTruthy();

    const totalL = () => {
      const stk = (st() as unknown as { stockpile?: Record<string, number> }).stockpile ?? {};
      return (
        (stk.antivenin_tonic ?? 0) +
        (st().pawns as Pawn[]).reduce(
          (n, p) => n + (carriedQuantities(p)['antivenin_tonic'] ?? 0),
          0
        )
      );
    };
    const before = totalL();
    s.command({
      type: 'pickUpItemFromTile',
      payload: { pawnId: carer!.id, dropId: phialId!, quantity: 1 }
    } as never);

    const c1 = st().pawns.find((p) => p.id === carer!.id) as Pawn;
    const held = carriedQuantities(c1)['antivenin_tonic'] ?? 0;
    console.log(
      `[ADM] total ${before} L -> ${totalL()} L after pickup; caretaker holds ${held} L, in a vessel: ${!!carrierOf(c1, 'antivenin_tonic')}`
    );
    expect(held, 'the tonic reached the caretaker instead of evaporating').toBeGreaterThan(0);
    expect(totalL(), 'no tonic destroyed by the pickup').toBeCloseTo(before, 3);
    expect(!!carrierOf(c1, 'antivenin_tonic'), 'found by searching nested contents').toBe(true);

    s.command({
      type: 'administerMedicine',
      payload: { caretakerId: carer!.id, patientId: patient!.id, itemId: 'antivenin_tonic' }
    } as never);
    const c2 = st().pawns.find((p) => p.id === carer!.id) as Pawn;
    const heldAfter = carriedQuantities(c2)['antivenin_tonic'] ?? 0;
    const got = Object.keys(
      (st().pawns.find((p) => p.id === patient!.id) as Pawn).conditionTimers ?? {}
    );
    console.log(
      `[ADM] dosed: phial ${held} -> ${heldAfter} L; patient now has ${got.join(',') || 'nothing'}`
    );
    expect(heldAfter, 'the dose came out of the phial').toBeLessThan(held);
    expect(got, 'the patient got the tonic effect').toContain('toxin_immune');
  }, 120000);
});
