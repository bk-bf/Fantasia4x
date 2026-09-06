import { defineConfig, type Plugin } from 'vitest/config';
import { fileURLToPath } from 'node:url';

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
  'src/tests/game/systems/t4WeaponFight.test.ts',
  'src/tests/game/systems/maimTargeting.test.ts',
  'src/tests/game/systems/carryCapacityAudit.test.ts',
  'src/tests/game/systems/weaponPawnFitNone.test.ts',
  'src/tests/game/systems/weaponPawnFitMedium.test.ts',
  'src/tests/game/systems/weaponPawnFitHeavy.test.ts',
  'src/tests/game/systems/creatureMatchup0.test.ts',
  'src/tests/game/systems/creatureMatchup1.test.ts',
  'src/tests/game/systems/creatureMatchup2.test.ts',
  'src/tests/game/systems/creatureMatchup3.test.ts',
  'src/tests/game/systems/creatureMatchup4.test.ts',
  'src/tests/game/systems/creatureMatchup5.test.ts',
  'src/tests/game/systems/creatureMatchup6.test.ts',
  'src/tests/game/systems/creatureMatchup7.test.ts'
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
    exclude: [
      'node_modules/**',
      '.svelte-kit/**',
      'build/**',
      ...(process.env.RUN_AUDITS ? [] : AUDIT_SUITES)
    ],
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: Math.max(1, Number(process.env.VITEST_MAX_FORKS) || 3)
      }
    }
  }
});
