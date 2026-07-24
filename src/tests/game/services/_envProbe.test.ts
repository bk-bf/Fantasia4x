import { describe, it } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
describe('env probe', () => {
  it('reports season/weather/temp and whether stored food spoils', async () => {
    const s = new HeadlessSession();
    await s.start(buildScenario({ seed: 11, map: { w: 16, h: 16 }, pawns: [{ count: 2 }],
      needsDisabled: ['hunger','fatigue'], items: { raw_meat: 20, plant_fiber: 20 }, seedEntities: false }));
    const g:any = s.getState();
    const p = g.pawns[0].position;
    const tile = g.worldMap[p.y][p.x];
    console.log(`[ENV] turn=${g.turn} season=${g.season} weather=${JSON.stringify(g.weather)} tileTerrain=${tile.terrainType} tileTemp=${tile.temperature}`);
    const drops = (g.droppedItems??[]).filter((d:any)=>d.resourceId==='raw_meat');
    console.log(`[ENV] raw_meat drops:`, JSON.stringify(drops));
    // tick a while and see if raw_meat (decaySeconds 300) shrinks or converts to rotten_meat
    const stk = () => (s.getState().stockpile ?? {}) as Record<string, number>;
    console.log(`[ENV] t0 raw_meat=${stk().raw_meat} rotten_meat=${stk().rotten_meat}`);
    for (let i=0;i<50;i++) s.tick(400); // 20000 ticks
    console.log(`[ENV] t20000 raw_meat=${stk().raw_meat} rotten_meat=${stk().rotten_meat} plant_fiber=${stk().plant_fiber} hay=${stk().hay}`);
    // now force warm summer + clear and see drying
    s.command({ type: 'setSeason', payload: { season: 'summer' } } as never);
    s.command({ type: 'setWeather', payload: { type: 'clear' } } as never);
    for (let i=0;i<30;i++) s.tick(400);
    const g2:any = s.getState();
    const tile2 = g2.worldMap[p.y][p.x];
    console.log(`[ENV] summer tileTemp=${tile2.temperature} raw_meat=${stk().raw_meat} rotten_meat=${stk().rotten_meat} plant_fiber=${stk().plant_fiber} hay=${stk().hay}`);
  });
});
