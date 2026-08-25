// Shared open/close state for the GEAR (creature armour) pop-up — one HUD-wide flag so a stale panel can't linger across selections.
export const armorToggle = $state({ open: false });
