/**
 * @typedef {object} CombatStatBlock
 * @property {number} [turnSpeed]
 * @property {number} [range]
 * @property {number} [maxHealth]
 * @property {number} [accuracy]
 * @property {number} [penetration]
 * @property {number} [speed]
 * @property {number} [moveSpeedMultiplier]
 * @property {number} [fireIntervalMultiplier]
 * @property {number} [reloadSpeedMultiplier]
 */

/**
 * @typedef {object} EnemyEntityDefinition
 * @property {string} type — actor/render type key
 * @property {number} radius
 * @property {number} baseSpeed
 * @property {number} maxHealth
 * @property {string} color
 * @property {"ranged" | "charge"} attackType
 * @property {boolean} [canDodge]
 * @property {number} [accelRate]
 * @property {boolean} [canDamageWalls]
 * @property {"circular" | "none"} [engagedStrafe]
 * @property {"staging" | "direct"} [chargePrepareMode]
 * @property {boolean} [excludeFromActiveCap]
 * @property {string[]} [startWeapons]
 * @property {string[]} [weaponPool]
 */

/**
 * @typedef {object} AllyEntityDefinition
 * @property {string} id
 * @property {string} [actorType]
 * @property {number} radius
 * @property {string} color
 * @property {CombatStatBlock} stats
 * @property {string} startGunId
 * @property {number} [leaderEdgeGap]
 */

/**
 * @typedef {object} EntitySpawnEvent
 * @property {string} type — enemy type id
 * @property {number} count
 */

/**
 * @typedef {object} EntityCatalog
 * @property {Record<string, EnemyEntityDefinition>} enemies
 * @property {Record<string, AllyEntityDefinition>} allies
 * @property {string[]} runParty — ally ids spawned at run start
 * @property {{ zombieHorde?: EntitySpawnEvent }} [events]
 */

export {};
