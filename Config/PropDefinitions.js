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
            damage: 100,
            lingerTimer: 750,
            fadeTimer: 250,
        },
        spawn: {
            minCount: 25,
            randomRange: 125,
        },
    }),
    crate: prop("crate", {
        hitBehavior: "damage",
        radius: 8,
        isPushable: true,
        laserTargetable: true,
        maxHealth: 30,
        mass: 1.5,
        wallPhysics: { restitution: 0.15, friction: 0.8 },
        spawn: {
            minCount: 8,
            randomRange: 17,
        },
    }),
};
