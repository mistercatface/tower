import { combatActorRadius, sidekickBaseStats } from "../../../Config/Config.js";
import { enemyStartGunPool } from "../../../Config/content/guns.js";
import { registerEntityCatalog } from "../../../Entities/EntityRegistry.js";

/** @type {import("../../../Entities/EntityRegistryTypes.js").EntityCatalog} */
export const towerEntityCatalog = {
    enemies: {
        kamikaze: {
            type: "kamikaze",
            radius: combatActorRadius,
            baseSpeed: 115,
            maxHealth: 2,
            color: "#FF9800",
            attackType: "charge",
            canDodge: false,
            accelRate: 1.0,
            canDamageWalls: true,
            weaponPool: enemyStartGunPool,
        },
        tank: {
            type: "tank",
            radius: combatActorRadius,
            baseSpeed: 50,
            maxHealth: 3,
            color: "#FF9800",
            attackType: "ranged",
            canDodge: false,
            weaponPool: enemyStartGunPool,
        },
        standard: {
            type: "standard",
            radius: combatActorRadius,
            baseSpeed: 75,
            maxHealth: 2,
            color: "#F44336",
            attackType: "ranged",
            canDodge: false,
            weaponPool: enemyStartGunPool,
        },
        fast: {
            type: "fast",
            radius: combatActorRadius,
            baseSpeed: 102,
            maxHealth: 2,
            color: "#FFEB3B",
            attackType: "ranged",
            canDodge: false,
            canDamageWalls: true,
            engagedStrafe: "circular",
            weaponPool: enemyStartGunPool,
        },
        spastic: {
            type: "spastic",
            radius: combatActorRadius,
            baseSpeed: 95,
            maxHealth: 2,
            color: "#C62828",
            attackType: "charge",
            canDodge: false,
            accelRate: 3,
            canDamageWalls: true,
            weaponPool: enemyStartGunPool,
        },
        dodger: {
            type: "dodger",
            radius: combatActorRadius,
            baseSpeed: 75,
            maxHealth: 2,
            color: "#03A9F4",
            attackType: "ranged",
            canDodge: true,
            engagedStrafe: "circular",
            weaponPool: enemyStartGunPool,
        },
        zombie: {
            type: "zombie",
            radius: combatActorRadius,
            baseSpeed: 85,
            maxHealth: 2,
            color: "#8BC34A",
            attackType: "charge",
            canDodge: false,
            accelRate: 2.5,
            chargePrepareMode: "direct",
            excludeFromActiveCap: true,
            startWeapons: [],
        },
    },

    allies: {
        barry: {
            id: "barry",
            actorType: "companion",
            radius: combatActorRadius,
            color: "#00BCD4",
            stats: sidekickBaseStats,
            startGunId: "tommyGun",
            leaderEdgeGap: 16,
        },
    },

    runParty: ["barry"],

    events: {
        zombieHorde: { type: "zombie", count: 25 },
    },
};

export function registerTowerEntities() {
    registerEntityCatalog(towerEntityCatalog);
}
