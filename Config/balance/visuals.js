/** Classic circle + turret HUD (H cycles modes). */
export const COMBAT_HUD_MODE = { OFF: 0, OVERLAY: 1, CLASSIC: 2 };
export const COMBAT_HUD_MODE_COUNT = 3;
export const COMBAT_HUD_MODE_LABELS = ["off", "overlay", "classic"];
export const hudSettings = { combatOverlayAlpha: 0.72 };
/** Baked prop sprite angle buckets when a prop omits strategy.quantizeSteps. */
export const defaultPropQuantizeSteps = { facing: 16, roll: 16 };
