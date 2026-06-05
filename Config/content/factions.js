/** Canonical faction ids for tower combat targeting and pair filters. */
export const factionIds = {
    player: "player",
    enemy: "enemy",
};

/**
 * Ordered pairs that may engage (projectiles, turrets, charge impact, separation hostility).
 * Order within each pair does not matter.
 */
export const hostileFactionPairs = [
    [factionIds.player, factionIds.enemy],
];
