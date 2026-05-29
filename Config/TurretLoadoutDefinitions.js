import { LASER_WEAPON_MODE } from "../Combat/WeaponSystem.js";
import {
    cloneTurretLoadout,
    defaultTurretLoadout,
    resolveLoadoutFromConfig,
    resolveTurretScope,
} from "./turretLoadoutPresets.js";

export {
    cloneTurretLoadout,
    defaultTurretLoadout,
    resolveLoadoutFromConfig,
    resolveTurretScope,
    turretLoadoutPresets,
} from "./turretLoadoutPresets.js";

const weaponModesById = {
    laser: LASER_WEAPON_MODE,
};

function isTurretLoadoutUpgradeActive(upgrade, state, actor) {
    if (upgrade.isAbility) {
        return !!state.abilities?.[upgrade.id];
    }
    return (actor.upgrades[upgrade.id]?.level ?? 0) > 0;
}

export function resolveActorTurretLoadouts(actor, state, upgradeDefs = []) {
    const turrets = actor.getTurrets();
    if (turrets.length === 0) return;

    for (const turret of turrets) {
        turret.loadout = cloneTurretLoadout(defaultTurretLoadout);
        turret.weaponMode = null;
    }

    const loadoutUpgrades = upgradeDefs
        .filter((upgrade) => upgrade.turretLoadout && isTurretLoadoutUpgradeActive(upgrade, state, actor))
        .sort((a, b) => (a.turretLoadout.priority ?? 0) - (b.turretLoadout.priority ?? 0));

    for (const upgrade of loadoutUpgrades) {
        const config = upgrade.turretLoadout;
        const indices = resolveTurretScope(config.scope, turrets.length);

        for (const index of indices) {
            const turret = turrets[index];
            if (config.weaponMode) {
                turret.weaponMode = weaponModesById[config.weaponMode] ?? null;
            }
            if (config.preset || config.radiusMultiplier != null || config.angleOffsets) {
                turret.loadout = resolveLoadoutFromConfig(config);
            }
        }
    }
}
