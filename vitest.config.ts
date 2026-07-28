import { defineConfig, type Plugin } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Minimal JSONC comment stripper — mirrors the one in vite.config.ts so the data
 * databases (items.jsonc, …) import the same way under Vitest as in the app.
 */
function stripJsoncComments(src: string): string {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < src.length) {
    if (inStr) {
      if (src[i] === '\\') {
        out += src[i] + src[i + 1];
        i += 2;
      } else if (src[i] === '"') {
        inStr = false;
        out += src[i++];
      } else {
        out += src[i++];
      }
    } else {
      if (src[i] === '"') {
        inStr = true;
        out += src[i++];
      } else if (src[i] === '/' && src[i + 1] === '/') {
        while (i < src.length && src[i] !== '\n') i++;
      } else if (src[i] === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
      } else {
        out += src[i++];
      }
    }
  }
  return out;
}

function jsoncPlugin(): Plugin {
  return {
    name: 'vite-plugin-jsonc',
    transform(code, id) {
      if (!id.endsWith('.jsonc')) return;
      return { code: `export default ${stripJsoncComments(code)}`, map: null };
    }
  };
}

/** The long-running balance sweeps — see the `exclude` note below. */
const AUDIT_SUITES = [
  'src/tests/game/systems/weaponMetaNone.test.ts',
  'src/tests/game/systems/weaponMetaLight.test.ts',
  'src/tests/game/systems/weaponMetaMedium.test.ts',
  'src/tests/game/systems/weaponMetaHeavy.test.ts',
  'src/tests/game/systems/weaponMetaHeadToHead.test.ts',
  'src/tests/game/systems/styleMatchups.test.ts',
  'src/tests/game/systems/armourStyleAudit.test.ts',
  'src/tests/game/systems/weaponFightSim.test.ts',
  'src/tests/game/systems/combatBalanceAudit.test.ts',
  'src/tests/game/systems/buildFitAudit.test.ts',
  'src/tests/game/systems/t4WeaponAudit.test.ts',
  'src/tests/game/systems/maimTargeting.test.ts',
  'src/tests/game/systems/carryCapacityAudit.test.ts',
  'src/tests/game/systems/weaponPawnFitNone.test.ts',
  'src/tests/game/systems/weaponPawnFitMedium.test.ts',
  'src/tests/game/systems/weaponPawnFitHeavy.test.ts'
];

export default defineConfig({
  plugins: [jsoncPlugin()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      '$app/environment': fileURLToPath(
        new URL('./tests/stubs/app-environment.ts', import.meta.url)
      )
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // The BALANCE AUDITS are excluded from the default run. They are not slow tests, they are sweeps —
    // thousands of real headless duels each — and together they take longer than the entire rest of the
    // suite put together (measured: styleMatchups 13 min, weaponFightSim 12 min, armourStyleAudit 7 min,
    // combatBalanceAudit 6.6 min, buildFitAudit 3 min, and weaponMeta ~45 min on its own). With them in,
    // `pnpm test` stopped finishing at all, which makes the gate useless for ordinary work.
    //
    // Run them deliberately with `pnpm test:audit`, ideally on a machine that is not the one being typed
    // on (see `audit.sh`). Raise `VITEST_MAX_FORKS` there — each audit is a separate FILE, so vitest's
    // fork pool fans them out; the sim's one-session-per-process rule (HeadlessSession) means the
    // parallelism has to come from separate processes, which is exactly what the fork pool gives.
    exclude: [
      'node_modules/**',
      '.svelte-kit/**',
      'build/**',
      ...(process.env.RUN_AUDITS ? [] : AUDIT_SUITES)
    ],
    // RESOURCE CAP (laptop OOM guard). Vitest defaults to one worker PER CORE — on a 22-thread box
    // that is ~21 parallel Node forks, each loading worldgen + WASM + the big JSONC databases. On a
    // 15 GB machine already deep into swap that thrashes RAM and OOM-kills the session. The suite does
    // not run in CI (the desktop build is manual, no test step), so a small default costs nothing
    // elsewhere. Override for a beefier box with `VITEST_MAX_FORKS=8 pnpm test`.
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: Math.max(1, Number(process.env.VITEST_MAX_FORKS) || 3)
      }
    }
  }
});
