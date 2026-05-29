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
    shotgun: {
        radiusMultiplier: playerProjectileSettings.splitRadiusMultiplier,
        pelletCount: 3,
        spreadRadians: 0.1,
    },
};

export const defaultTurretLoadout = turretLoadoutPresets.standard;

export function cloneTurretLoadout(loadout) {
    const cloned = {
        radiusMultiplier: loadout.radiusMultiplier,
    };
    if (loadout.angleOffsets) {
        cloned.angleOffsets = [...loadout.angleOffsets];
    }
    if (loadout.pelletCount != null) {
        cloned.pelletCount = loadout.pelletCount;
    }
    if (loadout.spreadRadians != null) {
        cloned.spreadRadians = loadout.spreadRadians;
    }
    return cloned;
}

/** Per-shot angles: fixed offsets, or random uniform spread in [-spreadRadians, spreadRadians]. */
export function resolveFireAngleOffsets(loadout) {
    if (loadout.pelletCount != null && loadout.spreadRadians != null) {
        const offsets = [];
        for (let i = 0; i < loadout.pelletCount; i++) {
            offsets.push((Math.random() * 2 - 1) * loadout.spreadRadians);
        }
        return offsets;
    }
    return loadout.angleOffsets ?? [0];
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
        angleOffsets: loadoutConfig.angleOffsets,
        pelletCount: loadoutConfig.pelletCount,
        spreadRadians: loadoutConfig.spreadRadians,
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
