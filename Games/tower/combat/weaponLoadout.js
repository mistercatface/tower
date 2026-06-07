import { enemyStartGunPool, getGunDefinition, playerStartGunId } from "../config/content/guns.js";
import { rollRandomLoadoutFromPool } from "./equipmentLoadout.js";
export function formatWeaponLoadoutLabel(actor) {
    const loadout = actor?.weaponLoadout ?? [];
    if (!loadout.length) return "Weapon: —";
    const parts = loadout.map((gunId) => {
        const gun = getGunDefinition(gunId);
        const name = gun.name ?? gun.id;
        const damage = gun.damage ?? gun.tickDamage;
        const damageHint = damage != null ? ` (${damage} dmg)` : "";
        return `${name}${damageHint}`;
    });
    return `Weapon: ${parts.join(" + ")}`;
}
export function rollPlayerStartLoadout() {
    return [playerStartGunId];
}
export function rollEnemyStartLoadout() {
    return rollRandomLoadoutFromPool(enemyStartGunPool);
}
