/** How a gun is held. Drives slot rules on actors. */
export const Handedness = { ONE_HANDED: "oneHanded", TWO_HANDED: "twoHanded" };
/** Actor can hold one two-handed weapon OR up to this many one-handed weapons. */
export const equipmentLimits = { maxOneHandedSlots: 2 };
export const defaultGunHandedness = Handedness.ONE_HANDED;
/** Weights for random starting loadouts (see Combat/equipmentLoadout.js). */
export const randomLoadoutSettings = { twoHandedRollChance: 0.4, dualWieldOneHandedChance: 0.35 };
/** Chance to start with two of the same service sidearm (both hands). */
export const dualServiceWeaponStart = { gunId: "servicePistol", chance: 0.18 };
