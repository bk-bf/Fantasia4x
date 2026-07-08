// Shared open/close state for the GEAR (creature armour) pop-up, mirroring `healthToggle`. One flag
// for the whole HUD so opening the panel on one selection doesn't leave a stale one open elsewhere.
export const armorToggle = $state({ open: false });
