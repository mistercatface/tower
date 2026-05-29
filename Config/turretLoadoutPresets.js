import { playerProjectileSettings } from "./Config.js";

export const turretLoadoutPresets = {
    standard: {
        radiusMultiplier: playerProjectileSettings.radiusMultiplier,
        angleOffsets: [0],
    },
    twin: {
        radiusMultiplier: playerProjectileSettings.splitRadiusMultiplier,
        angleOffsets: [-0.1, 0.1],
    },
    triple: {
        radiusMultiplier: playerProjectileSettings.splitRadiusMultiplier,
        angleOffsets: [-0.1, 0.1, 0],
    },
};

export const defaultTurretLoadout = turretLoadoutPresets.standard;

export function cloneTurretLoadout(loadout) {
    return {
        radiusMultiplier: loadout.radiusMultiplier,
        angleOffsets: [...loadout.angleOffsets],
    };
}

export function resolveLoadoutFromConfig(loadoutConfig) {
    if (!loadoutConfig) return cloneTurretLoadout(defaultTurretLoadout);

    if (loadoutConfig.preset) {
        const preset = turretLoadoutPresets[loadoutConfig.preset];
        if (!preset) {
            throw new Error(`Unknown turret loadout preset: ${loadoutConfig.preset}`);
        }
        return cloneTurretLoadout(preset);
    }

    return cloneTurretLoadout({
        radiusMultiplier: loadoutConfig.radiusMultiplier ?? defaultTurretLoadout.radiusMultiplier,
        angleOffsets: loadoutConfig.angleOffsets ?? defaultTurretLoadout.angleOffsets,
    });
}

/**
 * Which turrets an upgrade applies to.
 * - "all": every turret on the actor
 * - "primary": index 0
 * - number: single turret index
 * - { indices: [0, 2] }: explicit list
 */
export function resolveTurretScope(scope, turretCount) {
    if (turretCount <= 0) return [];

    if (scope === "all" || scope == null) {
        return Array.from({ length: turretCount }, (_, index) => index);
    }
    if (scope === "primary") {
        return [0];
    }
    if (typeof scope === "number") {
        return scope >= 0 && scope < turretCount ? [scope] : [];
    }
    if (Array.isArray(scope.indices)) {
        return scope.indices.filter((index) => index >= 0 && index < turretCount);
    }

    return Array.from({ length: turretCount }, (_, index) => index);
}
