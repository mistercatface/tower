import { applyActorGunModifiers } from "../../../Combat/gunCombat.js";
import { normalizeWeaponLoadout } from "../../../Combat/equipmentLoadout.js";
import { defaultGunId, getGunDefinition, cloneGunDefinition } from "../guns.js";
import { defaultTurretLoadout, resolveLoadoutFromConfig, resolveTurretScope } from "./loadout.js";
export { cloneTurretLoadout, defaultTurretLoadout, resolveFireAngleOffsets, resolveLoadoutFromConfig, resolveTurretScope } from "./loadout.js";
function isTurretLoadoutUpgradeActive(upgrade, state, actor) {
    if (upgrade.isAbility) return !!state.abilities?.[upgrade.id];
    return (actor.upgrades[upgrade.id]?.level ?? 0) > 0;
}
function isInlineLoadoutConfig(config) {
    return config.radiusMultiplier != null || config.angleOffsets || config.pelletCount != null || config.spreadRadians != null;
}
export function applyGunTurretLoadouts(actor) {
    const turrets = actor.getTurrets();
    if (turrets.length === 0) return;
    const weaponLoadout = normalizeWeaponLoadout(actor.weaponLoadout ?? []);
    for (let i = 0; i < turrets.length; i++) {
        const gunId = weaponLoadout[i] ?? defaultGunId;
        const gun = getGunDefinition(gunId);
        turrets[i].gunId = gunId;
        if (turrets[i].gun && turrets[i].gun.id === gunId) {
            // Keep existing instance to preserve attachments state
        } else turrets[i].gun = cloneGunDefinition(gun);
        turrets[i].loadout = resolveLoadoutFromConfig(gun.turretLoadout ?? defaultTurretLoadout);
    }
}
export function applyUpgradeTurretLoadouts(actor, state, upgradeDefs = []) {
    const turrets = actor.getTurrets();
    if (turrets.length === 0 || !state) return;
    const loadoutUpgrades = upgradeDefs
        .filter((upgrade) => upgrade.turretLoadout && isTurretLoadoutUpgradeActive(upgrade, state, actor))
        .sort((a, b) => (a.turretLoadout.priority ?? 0) - (b.turretLoadout.priority ?? 0));
    for (const upgrade of loadoutUpgrades) {
        const config = upgrade.turretLoadout;
        const indices = resolveTurretScope(config.scope, turrets.length);
        for (const index of indices) {
            const turret = turrets[index];
            if (config.gun) {
                if (turret.gun && turret.gun.id === config.gun) {
                    // Keep existing instance
                } else turret.gun = cloneGunDefinition(getGunDefinition(config.gun));
                turret.gunId = config.gun;
            }
            if (isInlineLoadoutConfig(config)) turret.loadout = resolveLoadoutFromConfig(config);
        }
    }
}
export function resolveActorTurretLoadouts(actor, state, upgradeDefs = []) {
    applyGunTurretLoadouts(actor);
    applyUpgradeTurretLoadouts(actor, state, upgradeDefs);
    applyActorGunModifiers(actor);
}
