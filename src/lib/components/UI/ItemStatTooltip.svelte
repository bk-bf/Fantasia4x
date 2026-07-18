<!-- ItemStatTooltip.svelte — combat/gear stat + ability breakdown for a craftable, shown on hover
     before crafting. Reuses the work-tab job-priority tooltip format (WorkCellTooltip): portaled
     panel, header line, label/value rows, and a separated MODIFIERS/ABILITIES block. -->
<script lang="ts">
  import type { Item, Recipe, EquipmentSlot } from '$lib/game/core/types';
  import type { NaturalGearMeta } from '$lib/components/util/naturalGear';
  import { coveredParts } from '$lib/game/core/armorCoverage';
  import { partLabel } from '$lib/utils/bodyLabels';
  import { recipeService } from '$lib/game/services/RecipeService';
  import { getMaterialProperty } from '$lib/game/core/materialProperties';
  import { itemService } from '$lib/game/services/ItemService';
  import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
  import { SOIL_TIER_NAME, type SoilTier } from '$lib/game/core/Terrains';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';
  import { TURNS_PER_DAY } from '$lib/game/services/EnvironmentService';

  // decaySeconds is authored in in-game seconds; one in-game day = TURNS_PER_DAY (300) of them.
  const spoilDuration = (s: number): string => {
    const days = s / TURNS_PER_DAY;
    if (days >= 1)
      return `${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? '' : 's'}`;
    const hours = days * 24;
    return `${hours >= 1 ? Math.round(hours) : hours.toFixed(1)} hr`;
  };
  // Qualitative spoilage speed (shelf life in days), so the player gets an at-a-glance read.
  const spoilSpeed = (s: number): string => {
    const days = s / TURNS_PER_DAY;
    return days <= 1 ? 'Fast' : days <= 5 ? 'Moderate' : 'Slow';
  };

  interface Props {
    item: Item;
    x: number;
    y: number;
    /** Producing recipe + chosen ingredients — drives the per-material stat/nutrition deltas. */
    recipe?: Recipe | null;
    selectedIngredients?: Record<string, string>;
    /** Work category (labor) this craft belongs to — "Butchery" / "Leatherworking" / "General
     *  Crafting" / "Cooking" … Shown as the first row so the player knows which job performs it. */
    jobLabel?: string | null;
    /** Natural-gear extras (innate / evolution stage / carry cost) — rendered in a NATURAL block.
     *  Null for normal craftables, so their tooltip is unchanged. */
    natural?: NaturalGearMeta | null;
    /** Pinned (clicked open) — the panel becomes pointer-interactive; dismissal is handled by the pin
     *  controller. Defaults false so plain-hover callers are unchanged. */
    pinned?: boolean;
    /** §2 weapon coating active on the hovered equipped instance (name + on-hit effect) — rendered as a
     *  COATED block. Null/omitted for uncoated items and non-instance callers. */
    coating?: { name: string; effect: string } | null;
  }
  let {
    item,
    x,
    y,
    recipe = null,
    selectedIngredients = {},
    jobLabel = null,
    natural = null,
    pinned = false,
    coating = null
  }: Props = $props();

  // Per-material weapon/armour deltas for the chosen ingredient(s) (e.g. ash shaft → +3 accuracy).
  let deltas = $derived(
    recipe
      ? recipeService.applyMaterialBonuses(recipe, selectedIngredients)
      : { weaponDelta: {}, armorDelta: {} }
  );
  let matDelta = $derived([
    ...Object.entries(deltas.weaponDelta),
    ...Object.entries(deltas.armorDelta)
  ] as [string, number][]);
  // Names of the chosen materials, for the section header.
  let matNames = $derived(
    Object.values(selectedIngredients)
      .map((id) => itemService.getItemById(id)?.name ?? id.replace(/_/g, ' '))
      .join(', ')
  );
  // §M generic material-property summaries (durability/beauty/weight…) for the chosen materials.
  let matNotes = $derived(
    Object.values(selectedIngredients)
      .map((id) => getMaterialProperty(id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => `${m.label}: ${m.desc}`)
  );
  // Dynamic-recipe variant nutrition tweak (e.g. cooked-meat-over-venison), added to base nutrition.
  let nutritionBonus = $derived.by(() => {
    if (!recipe?.dynamicRecipe) return 0;
    let sum = 0;
    for (const [slot, chosen] of Object.entries(selectedIngredients)) {
      sum += recipe.dynamicRecipe[slot]?.variants?.[chosen]?.nutritionBonus ?? 0;
    }
    return sum;
  });

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // ADR-029: the parts a worn piece protects, as a concise side-agnostic list ("chest, shoulder, forearm").
  const coversSummary = (parts: string[]): string => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of parts) {
      const label = partLabel(p)
        .replace(/^(left|right)\s+/i, '')
        .toLowerCase();
      if (!seen.has(label)) {
        seen.add(label);
        out.push(label);
      }
    }
    return out.join(', ');
  };
  const pct = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`;
  const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

  const FIELD_LABELS: Record<string, string> = {
    damMin: 'Min dmg',
    damMax: 'Max dmg',
    damage: 'Damage',
    accuracy: 'Accuracy',
    armorPenetration: 'Armor pen.',
    critMod: 'Crit',
    attackSpeed: 'Atk speed',
    reach: 'Reach',
    range: 'Range',
    staminaCost: 'Stamina',
    bluntMod: 'Blunt',
    maxDurability: 'Durability',
    defense: 'Defense'
  };
  const fieldLabel = (f: string) => FIELD_LABELS[f] ?? cap(f.replace(/([A-Z])/g, ' $1').trim());
  const fmtDelta = (f: string, v: number) => (f === 'critMod' ? pct(v) : signed(v));

  type Row = { label: string; val: string };

  // The headline shown next to the name (the item's defining number).
  let headline = $derived.by(() => {
    const wp = item.weaponProperties;
    const ap = item.armorProperties;
    if (wp) {
      const dmg =
        wp.damMin != null && wp.damMax != null ? `${wp.damMin}–${wp.damMax}` : `${wp.damage ?? 0}`;
      return `${dmg} dmg`;
    }
    if (ap) return `${ap.armorValue ?? ap.defense ?? 0} def`;
    if (item.type === 'tool') return 'tool';
    return cap(item.type);
  });

  let rows = $derived.by(() => {
    const out: Row[] = [];
    const wp = item.weaponProperties;
    const ap = item.armorProperties;

    if (wp) {
      if (wp.damageType) out.push({ label: 'Damage type', val: cap(wp.damageType) });
      if (wp.attackSpeed != null) out.push({ label: 'Attack speed', val: `×${wp.attackSpeed}` });
      const reach = wp.reach ?? wp.range;
      if (reach != null)
        out.push({ label: 'Reach', val: `${reach} ${reach === 1 ? 'tile' : 'tiles'}` });
      if (wp.accuracy != null) out.push({ label: 'Accuracy', val: signed(wp.accuracy) });
      if (wp.armorPenetration != null)
        out.push({ label: 'Armor pen.', val: `×${wp.armorPenetration}` });
      if (wp.critMod != null) out.push({ label: 'Crit', val: pct(wp.critMod) });
      if (wp.staminaCost != null) out.push({ label: 'Stamina', val: `${wp.staminaCost}` });
      if (wp.twoHanded) out.push({ label: 'Grip', val: 'Two-handed' });
    }

    if (ap) {
      if (ap.armorType) out.push({ label: 'Class', val: cap(ap.armorType) });
      const slot = ap.slot ?? ap.equipmentSlot;
      if (slot)
        out.push({
          label: 'Slot',
          val: cap(
            String(slot)
              .replace(/([A-Z])/g, ' $1')
              .trim()
          )
        });
      // ADR-029: which body parts this piece actually protects (a breastplate ≠ head cover).
      const covers = slot ? coveredParts(item, slot as EquipmentSlot) : [];
      if (covers.length) out.push({ label: 'Covers', val: coversSummary(covers) });
      if (ap.armorLayer) out.push({ label: 'Layer', val: cap(ap.armorLayer) });
      if (ap.slashResistance) out.push({ label: 'Slash res.', val: pct(ap.slashResistance) });
      if (ap.crushResistance) out.push({ label: 'Crush res.', val: pct(ap.crushResistance) });
      if (ap.pierceResistance) out.push({ label: 'Pierce res.', val: pct(ap.pierceResistance) });
      if (ap.parryChance) out.push({ label: 'Parry', val: pct(ap.parryChance) });
      if (ap.coldResistance) out.push({ label: 'Cold res.', val: pct(ap.coldResistance) });
      if (ap.heatResistance) out.push({ label: 'Heat res.', val: pct(ap.heatResistance) });
      if (ap.movementPenalty) out.push({ label: 'Move penalty', val: pct(-ap.movementPenalty) });
      if (ap.fatiguePerTurn) out.push({ label: 'Fatigue/turn', val: `${ap.fatiguePerTurn}` });
    }

    if (item.type === 'tool' && item.toolBoost) {
      // Name the actual work(s) the tool serves instead of a bare "Work speed". A tool boosts only
      // the work categories that LIST it in `toolsRequired` (Work.ts) — the same list that gates them.
      const works = WORK_CATEGORIES.filter(
        (c) => c.toolsRequired?.includes(item.id) || c.boostTools?.includes(item.id)
      ).map((c) => c.name);
      const workLabel = works.length ? works.join(' / ') : 'Work';
      if (item.toolBoost.speed != null)
        out.push({ label: `${workLabel} speed`, val: pct(item.toolBoost.speed) });
      if (item.toolBoost.yield != null)
        out.push({ label: `${workLabel} yield`, val: pct(item.toolBoost.yield) });
    }

    if (item.nutrition != null || nutritionBonus) {
      const base = item.nutrition ?? 0;
      out.push({
        label: 'Nutrition',
        val: `${base + nutritionBonus}${nutritionBonus ? ` (+${nutritionBonus})` : ''}`
      });
    }
    if (item.medicineQuality != null)
      out.push({ label: 'Medicine quality', val: pct(item.medicineQuality) });
    if (item.preservationBonus != null)
      out.push({ label: 'Preservation', val: pct(item.preservationBonus) });
    if (item.fuelValue != null) out.push({ label: 'Fuel value', val: `${item.fuelValue}` });

    // Spoilage (decaySeconds): shelf life (duration) + qualitative speed + what it rots into.
    if (item.decaySeconds != null) {
      out.push({ label: 'Spoils in', val: spoilDuration(item.decaySeconds) });
      out.push({ label: 'Spoilage', val: spoilSpeed(item.decaySeconds) });
      if (item.decaysTo) {
        const into =
          itemService.getItemById(item.decaysTo)?.name ?? item.decaysTo.replace(/_/g, ' ');
        out.push({ label: 'Spoils into', val: into });
      }
    }

    if (item.maxDurability != null) out.push({ label: 'Durability', val: `${item.maxDurability}` });
    if (item.weightKg != null) out.push({ label: 'Weight', val: `${item.weightKg} kg` });
    if (item.rarity && item.rarity !== 'common')
      out.push({ label: 'Rarity', val: cap(item.rarity) });

    return out;
  });

  // FARMING — when this item is a crop's SEED or its harvested PRODUCE, surface the crop's grow window
  // (temp / water / soil / time) so the requirements read off either the seed bag or the harvest stack.
  let farming = $derived.by((): { crop: string; rows: Row[] } | null => {
    const c = resourceObjectService.getCropForItem(item.id);
    if (!c?.def.crop) return null;
    const cr = c.def.crop;
    const days = cr.growthTurns / TURNS_PER_DAY;
    const rows: Row[] = [
      { label: 'Grows', val: `${cr.minTemp} to ${cr.maxTemp}°C` },
      { label: 'Water', val: `${cr.minMoisture}–${cr.maxMoisture}%` },
      { label: 'Soil', val: `≥ ${SOIL_TIER_NAME[cr.minSoil as SoilTier] ?? cr.minSoil}` },
      { label: 'Matures', val: `${Number.isInteger(days) ? days : days.toFixed(1)} days` }
    ];
    if (cr.needsLight) rows.push({ label: 'Light', val: 'needs sun' });
    return { crop: c.def.displayName, rows };
  });

  // Generic effects map (e.g. consumables / gear stat tweaks) → the MODIFIERS block.
  let effects = $derived(Object.entries(item.effects ?? {}));
  // Ability grants from COMBAT-SYSTEM weapon tags.
  let abilities = $derived(item.weaponProperties?.tags ?? []);

  // Flip the box to the cursor's left/upper side when near a viewport edge (same as WorkCellTooltip).
  let flipX = $derived(typeof window !== 'undefined' && x > window.innerWidth - 280);
  let flipY = $derived(typeof window !== 'undefined' && y > window.innerHeight - 260);
  let style = $derived(
    `${flipX ? `right:${window.innerWidth - x + 14}px` : `left:${x + 16}px`};` +
      `${flipY ? `bottom:${window.innerHeight - y + 14}px` : `top:${y + 16}px`};`
  );
</script>

<div class="tip" class:pinned use:portal data-pin-panel {style}>
  <div class="tip-hdr">
    <span class="tip-name">{item.name}</span>
    <span class="tip-eff">{headline}</span>
  </div>

  {#if item.description}
    <div class="tip-desc">{item.description}</div>
  {/if}

  {#if jobLabel}
    <div class="tip-row tip-job">
      <span class="tip-lbl">Job</span>
      <span class="tip-job-val">{jobLabel}</span>
    </div>
  {/if}

  {#each rows as r}
    <div class="tip-row">
      <span class="tip-lbl">{r.label}</span>
      <span>{r.val}</span>
    </div>
  {/each}

  {#if coating}
    <div class="tip-sep">COATED</div>
    <div class="tip-row">
      <span class="tip-lbl">{coating.name}</span>
      <span class="tip-coat-eff">{coating.effect}</span>
    </div>
  {/if}

  {#if natural}
    <div class="tip-sep">NATURAL</div>
    <div class="tip-row">
      <span class="tip-lbl">Innate</span>
      <span>Yes · can't be unequipped</span>
    </div>
    {#if natural.carryPenalty}
      <div class="tip-row">
        <span class="tip-lbl">Carry cost</span>
        <span>−{Math.round(natural.carryPenalty * 100)}%</span>
      </div>
    {/if}
    {#if natural.stage}
      <div class="tip-row">
        <span class="tip-lbl">Evolution</span>
        <span>Stage {natural.stage}/3 · {natural.evolves ? 'grows with age' : 'apex'}</span>
      </div>
    {/if}
  {/if}

  {#if farming}
    <div class="tip-sep">FARMING · {farming.crop}</div>
    {#each farming.rows as r}
      <div class="tip-row">
        <span class="tip-lbl">{r.label}</span>
        <span>{r.val}</span>
      </div>
    {/each}
  {/if}

  {#if matDelta.length > 0 || matNotes.length > 0}
    <div class="tip-sep">
      MATERIAL{#if matNames}
        · {matNames}{/if}
    </div>
    {#each matDelta as [field, val]}
      <div class="tip-mod">
        <span class="tip-mod-name">{fieldLabel(field)}</span>
        <span class="tip-mod-val" style="color:{val >= 0 ? '#6bc' : '#e08'}"
          >{fmtDelta(field, val)}</span
        >
      </div>
    {/each}
    {#each matNotes as note}
      <div class="tip-mod" style="color:#7e9fbf">{note}</div>
    {/each}
  {/if}

  {#if abilities.length > 0}
    <div class="tip-sep">ABILITIES</div>
    {#each abilities as a}
      <div class="tip-mod">
        <span class="tip-mod-name" style="color:#6bc">{cap(a)}</span>
      </div>
    {/each}
  {/if}

  {#if effects.length > 0}
    <div class="tip-sep">EFFECTS</div>
    {#each effects as [name, val]}
      <div class="tip-mod">
        <span class="tip-mod-name" style="color:{val >= 0 ? '#6bc' : '#e08'}"
          >{cap(name.replace(/([A-Z])/g, ' $1').trim())}</span
        >
        <span class="tip-mod-val">{signed(val)}</span>
      </div>
    {/each}
  {/if}
</div>

<style>
  .tip {
    position: fixed;
    z-index: 1000;
    min-width: 190px;
    max-width: 260px;
    padding: 5px 7px;
    background: var(--bg-panel, #11151c);
    border: 1px solid var(--border-hi, #3a4656);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text);
    pointer-events: none;
  }
  /* Pinned: frozen + clickable (nested content reachable), with a faint accent outline. */
  .tip.pinned {
    pointer-events: auto;
    box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.55),
      0 0 0 1px var(--accent, #e8c870);
  }
  .tip-hdr {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 3px;
    margin-bottom: 3px;
  }
  .tip-name {
    color: var(--accent-hi);
    letter-spacing: 0.04em;
  }
  .tip-eff {
    font-weight: bold;
    color: var(--accent);
    white-space: nowrap;
  }
  .tip-desc {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.4;
    font-style: italic;
    margin-bottom: 4px;
  }
  .tip-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    line-height: 1.5;
  }
  .tip-lbl {
    color: var(--text-dim);
  }
  /* The job/work-category line sits just under the header, set apart with a soft rule + accent value. */
  .tip-job {
    border-bottom: 1px solid var(--border);
    padding-bottom: 3px;
    margin-bottom: 2px;
  }
  .tip-job-val {
    color: var(--accent-hi);
  }
  .tip-sep {
    margin-top: 4px;
    padding-top: 3px;
    border-top: 1px solid var(--border);
    color: var(--text-muted, #555);
    font-size: 10px;
    letter-spacing: 0.08em;
  }
  .tip-mod {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    line-height: 1.45;
  }
  .tip-mod-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tip-mod-val {
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .tip-coat-eff {
    color: #b98fe6;
  }
</style>
