import { applyActorGunModifiers } from "../Combat/gunCombat.js";
import { normalizeWeaponLoadout } from "../Combat/equipmentLoadout.js";
import { defaultGunId, getGunDefinition } from "./gunDefinitions.js";
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

function isTurretLoadoutUpgradeActive(upgrade, state, actor) {
    if (upgrade.isAbility) {
        return !!state.abilities?.[upgrade.id];
    }
    return (actor.upgrades[upgrade.id]?.level ?? 0) > 0;
}

export function resolveActorTurretLoadouts(actor, state, upgradeDefs = []) {
    const turrets = actor.getTurrets();
    if (turrets.length === 0) return;

    const weaponLoadout = normalizeWeaponLoadout(actor.weaponLoadout ?? []);

    for (let i = 0; i < turrets.length; i++) {
        const gunId = weaponLoadout[i] ?? defaultGunId;
        const gun = getGunDefinition(gunId);
        turrets[i].gunId = gunId;
        turrets[i].loadout = resolveLoadoutFromConfig(gun.turretLoadout ?? { preset: "standard" });
    }

    const loadoutUpgrades = upgradeDefs
        .filter((upgrade) => upgrade.turretLoadout && isTurretLoadoutUpgradeActive(upgrade, state, actor))
        .sort((a, b) => (a.turretLoadout.priority ?? 0) - (b.turretLoadout.priority ?? 0));

    for (const upgrade of loadoutUpgrades) {
        const config = upgrade.turretLoadout;
        const indices = resolveTurretScope(config.scope, turrets.length);

        for (const index of indices) {
            const turret = turrets[index];
            if (config.gun) {
                turret.gunId = config.gun;
            }
            if (config.preset || config.radiusMultiplier != null || config.angleOffsets) {
                turret.loadout = resolveLoadoutFromConfig(config);
            }
        }
    }

    applyActorGunModifiers(actor);
}
