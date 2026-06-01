import { explosionSettings } from "./Config.js";

const DEFAULT_SPAWN_RADIUS = { minRadius: 150, maxRadius: 1000 };

function prop(key, { spawn, ...rest }) {
    return {
        render3DKey: key,
        renderMode: "3d",
        ...rest,
        spawn: spawn ? { ...DEFAULT_SPAWN_RADIUS, ...spawn } : undefined,
    };
}

export const worldPropDefinitions = {
    barrel: prop("barrel", {
        inspectKey: "jacko_can",
        hitBehavior: "explosive",
        radius: 8,
        isPushable: true,
        laserTargetable: true,
        maxHealth: 3,
        onFire: { burnDurationMs: 2000 },
        wallPhysics: { restitution: 0.25, friction: 0.75 },
        explosion: {
            type: "standard",
            radius: 0,
            maxRadius: 100,
            speed: 300,
            damage: explosionSettings.barrelDamage,
            lingerTimer: 750,
            fadeTimer: 250,
        },
        spawn: {
            minCount: 25,
            randomRange: 125,
        },
    }),
    crate: prop("crate", {
        inspectKey: "wood_crate",
        hitBehavior: "damage",
        radius: 8,
        isPushable: true,
        laserTargetable: true,
        maxHealth: 2,
        mass: 1.5,
        wallPhysics: { restitution: 0.15, friction: 0.8 },
        spawn: {
            minCount: 8,
            randomRange: 17,
        },
    }),
    crate_shard: prop("crate_shard", {
        inspectKey: null,
        hitBehavior: "damage",
        radius: 3,
        isPushable: true,
        laserTargetable: false,
        maxHealth: 1,
        mass: 0.05,
        wallPhysics: { restitution: 0.45, friction: 0.5 },
    }),
};
