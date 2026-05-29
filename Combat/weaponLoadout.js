import { enemyStartGunPool, getGunDefinition, playerStartGunPool } from "../Config/gunDefinitions.js";

export function formatWeaponLoadoutLabel(actor) {
    if (!actor?.weaponLoadout?.length) {
        return "Weapon: —";
    }

    const gun = getGunDefinition(actor.weaponLoadout[0]);
    const name = gun.name ?? gun.id;
    const damage = gun.damage ?? gun.tickDamage;
    const damageHint = damage != null ? ` · ${damage} dmg` : "";
    return `Weapon: ${name}${damageHint}`;
}

export function rollRandomWeaponLoadout(pool, slotCount = 1) {
    if (slotCount <= 0 || pool.length === 0) return [];

    const guns = [];
    for (let i = 0; i < slotCount; i++) {
        guns.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return guns;
}

export function rollPlayerStartLoadout() {
    return rollRandomWeaponLoadout(playerStartGunPool, 1);
}

export function rollEnemyStartLoadout() {
    return rollRandomWeaponLoadout(enemyStartGunPool, 1);
}
