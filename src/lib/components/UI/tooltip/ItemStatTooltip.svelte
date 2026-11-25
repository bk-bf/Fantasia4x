<script lang="ts">
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import KvRow from '$lib/components/UI/widget/KvRow.svelte';
  import type { Item, Recipe, EquipmentSlot } from '$lib/game/core/types';
  import type { NaturalGearMeta } from '$lib/components/util/naturalGear';
  import { coveredParts } from '$lib/game/core/rules/gear/armorCoverage';
  import { partLabel } from '$lib/components/util/bodyLabels';
  import { getMaterialProperty, aggregateMaterialMods } from '$lib/game/core/defs/materials';
  import { itemService } from '$lib/game/services/ItemService';
  import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
  import { SOIL_TIER_NAME, type SoilTier } from '$lib/game/core/defs/terrains';
  import { WORK_CATEGORIES } from '$lib/game/core/defs/work';
  import { TURNS_PER_DAY } from '$lib/game/services/EnvironmentService';

  const spoilDuration = (s: number): string => {
    const days = s / TURNS_PER_DAY;
    if (days >= 1)
      return `${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? '' : 's'}`;
    const hours = days * 24;
    return `${hours >= 1 ? Math.round(hours) : hours.toFixed(1)} hr`;
  };
  const spoilSpeed = (s: number): string => {
    const days = s / TURNS_PER_DAY;
    return days <= 1 ? 'Fast' : days <= 5 ? 'Moderate' : 'Slow';
  };

  interface Props {
    item: Item;
    x: number;
    y: number;
    recipe?: Recipe | null;
    selectedIngredients?: Record<string, string>;
    jobLabel?: string | null;
    natural?: NaturalGearMeta | null;
    pinned?: boolean;
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

  let matNames = $derived(
    Object.values(selectedIngredients)
      .map((id) => itemService.getItemById(id)?.name ?? id.replace(/_/g, ' '))
      .join(', ')
  );
  let matNotes = $derived(
    Object.values(selectedIngredients)
      .map((id) => getMaterialProperty(id))
      .filter((m): m is NonNullable<typeof m> => !!m)
  );
  let matItemMods = $derived(
    Object.values(selectedIngredients).length
      ? aggregateMaterialMods(Object.values(selectedIngredients), 'item')
      : { durability: 1, weight: 1 }
  );
  let nutritionBonus = $derived.by(() => {
    if (!recipe?.dynamicRecipe) return 0;
    let sum = 0;
    for (const [slot, chosen] of Object.entries(selectedIngredients)) {
      sum += recipe.dynamicRecipe[slot]?.variants?.[chosen]?.nutritionBonus ?? 0;
    }
    return sum;
  });

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
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

  type Row = { label: string; val: string };

  let rows = $derived.by(() => {
    const out: Row[] = [];
    const wp = item.weaponProperties;
    const ap = item.armorProperties;

    if (wp) {
      const dmg =
        wp.damMin != null && wp.damMax != null
          ? `${wp.damMin} to ${wp.damMax}`
          : `${wp.damage ?? 0}`;
      out.push({ label: 'Damage', val: dmg });
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
      out.push({ label: 'Defence', val: `${ap.armorValue ?? ap.defense ?? 0}` });
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
      const covers = slot ? coveredParts(item, slot as EquipmentSlot) : [];
      if (covers.length) out.push({ label: 'Covers', val: coversSummary(covers) });
      if (ap.armorLayer) out.push({ label: 'Layer', val: cap(ap.armorLayer) });
      if (ap.slashResistance) out.push({ label: 'Slash res.', val: pct(ap.slashResistance) });
      if (ap.crushResistance) out.push({ label: 'Crush res.', val: pct(ap.crushResistance) });
      if (ap.pierceResistance) out.push({ label: 'Pierce res.', val: pct(ap.pierceResistance) });
      if (ap.parryChance) out.push({ label: 'Parry', val: pct(ap.parryChance) });
      if (ap.coldResistance) out.push({ label: 'Cold res.', val: pct(ap.coldResistance) });
      if (ap.heatResistance) out.push({ label: 'Heat res.', val: pct(ap.heatResistance) });
      if (ap.movementPenalty) out.push({ label: 'Evasion penalty', val: pct(-ap.movementPenalty) });
      if (ap.fatiguePerTurn) out.push({ label: 'Fatigue/turn', val: `${ap.fatiguePerTurn}` });
    }

    if (item.type === 'tool' && item.toolBoost) {
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
    if (item.container)
      out.push({
        label: 'Holds',
        val:
          `${item.container.capacityL} L` +
          (item.container.capacityKg ? ` / ${item.container.capacityKg} kg` : '') +
          (item.container.sealed ? ' · sealed' : '')
      });
    if (item.fuelValue != null) out.push({ label: 'Fuel value', val: `${item.fuelValue}` });

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

  let farming = $derived.by((): { crop: string; rows: Row[] } | null => {
    const c = resourceObjectService.getCropForItem(item.id);
    if (!c?.def.crop) return null;
    const cr = c.def.crop;
    const days = (c.def.growthTurns ?? 0) / TURNS_PER_DAY;
    const rows: Row[] = [
      { label: 'Grows', val: `${cr.minTemp} to ${cr.maxTemp}°C` },
      { label: 'Water', val: `${cr.minMoisture}–${cr.maxMoisture}%` },
      { label: 'Soil', val: `≥ ${SOIL_TIER_NAME[cr.minSoil as SoilTier] ?? cr.minSoil}` },
      { label: 'Matures', val: `${Number.isInteger(days) ? days : days.toFixed(1)} days` }
    ];
    if (cr.needsLight) rows.push({ label: 'Light', val: 'needs sun' });
    return { crop: c.def.displayName, rows };
  });

  let effects = $derived(Object.entries(item.effects ?? {}));
  let abilities = $derived(item.weaponProperties?.tags ?? []);
</script>

<HoverTip {x} {y} {pinned}>
  <h5>{item.name}</h5>
  {#if item.description}<p>{item.description}</p>{/if}
  {#if jobLabel}<KvRow label="Job">{jobLabel}</KvRow>{/if}
  {#each rows as r (r.label)}
    <KvRow label={r.label}>{r.val}</KvRow>
  {/each}

  {#if coating}
    <div class="tip-sep">Coated</div>
    <KvRow label={coating.name}>{coating.effect}</KvRow>
  {/if}

  {#if natural}
    <div class="tip-sep">Natural</div>
    <KvRow label="Innate">can't be taken off</KvRow>
    {#if natural.carryPenalty}
      <KvRow label="Carry cost">−{Math.round(natural.carryPenalty * 100)}%</KvRow>
    {/if}
    {#if natural.stage}
      <KvRow label="Growth"
        >stage {natural.stage} of 3 · {natural.evolves ? 'grows with age' : 'full grown'}</KvRow
      >
    {/if}
  {/if}

  {#if farming}
    <div class="tip-sep">Farming · {farming.crop}</div>
    {#each farming.rows as r (r.label)}
      <KvRow label={r.label}>{r.val}</KvRow>
    {/each}
  {/if}

  {#if matNotes.length > 0 || matItemMods.durability !== 1 || matItemMods.weight !== 1}
    <div class="tip-sep">
      Material{#if matNames}&nbsp;· {matNames}{/if}
    </div>
    {#if matItemMods.durability !== 1}
      <KvRow label="Durability">×{matItemMods.durability.toFixed(2)}</KvRow>
    {/if}
    {#if matItemMods.weight !== 1}
      <KvRow label="Weight">×{matItemMods.weight.toFixed(2)}</KvRow>
    {/if}
    {#each matNotes as m (m.label)}
      <KvRow label={m.label}>{m.desc}</KvRow>
    {/each}
  {/if}

  {#if abilities.length > 0}
    <div class="tip-sep">Abilities</div>
    <p>{abilities.map(cap).join(' · ')}</p>
  {/if}

  {#if effects.length > 0}
    <div class="tip-sep">Effects</div>
    {#each effects as [name, val] (name)}
      <KvRow label={cap(name.replace(/([A-Z])/g, ' $1').trim())}>{signed(val)}</KvRow>
    {/each}
  {/if}
</HoverTip>
