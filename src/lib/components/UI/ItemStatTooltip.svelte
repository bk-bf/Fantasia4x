<!-- ItemStatTooltip.svelte — combat/gear stat + ability breakdown for a craftable, shown on hover
     before crafting. Reuses the work-tab job-priority tooltip format (WorkCellTooltip): portaled
     panel, header line, label/value rows, and a separated MODIFIERS/ABILITIES block. -->
<script lang="ts">
  import type { Item, Recipe } from '$lib/game/core/types';
  import { recipeService } from '$lib/game/services/RecipeService';
  import { itemService } from '$lib/game/services/ItemService';

  interface Props {
    item: Item;
    x: number;
    y: number;
    /** Producing recipe + chosen ingredients — drives the per-material stat/nutrition deltas. */
    recipe?: Recipe | null;
    selectedIngredients?: Record<string, string>;
  }
  let { item, x, y, recipe = null, selectedIngredients = {} }: Props = $props();

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
        wp.damMin != null && wp.damMax != null
          ? `${wp.damMin}–${wp.damMax}`
          : `${wp.damage ?? wp.baseDamage ?? 0}`;
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
      if (slot) out.push({ label: 'Slot', val: cap(String(slot)) });
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
      if (item.toolBoost.speed != null)
        out.push({ label: 'Work speed', val: pct(item.toolBoost.speed) });
      if (item.toolBoost.yield != null)
        out.push({ label: 'Work yield', val: pct(item.toolBoost.yield) });
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

    if (item.maxDurability != null) out.push({ label: 'Durability', val: `${item.maxDurability}` });
    if (item.weightKg != null) out.push({ label: 'Weight', val: `${item.weightKg} kg` });
    if (item.rarity && item.rarity !== 'common')
      out.push({ label: 'Rarity', val: cap(item.rarity) });

    return out;
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

<div class="tip" use:portal {style}>
  <div class="tip-hdr">
    <span class="tip-name">{item.name}</span>
    <span class="tip-eff">{headline}</span>
  </div>

  {#each rows as r}
    <div class="tip-row">
      <span class="tip-lbl">{r.label}</span>
      <span>{r.val}</span>
    </div>
  {/each}

  {#if matDelta.length > 0}
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
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: var(--text);
    pointer-events: none;
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
  .tip-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    line-height: 1.5;
  }
  .tip-lbl {
    color: var(--text-dim);
  }
  .tip-sep {
    margin-top: 4px;
    padding-top: 3px;
    border-top: 1px solid var(--border);
    color: var(--text-muted, #555);
    font-size: 9px;
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
</style>
