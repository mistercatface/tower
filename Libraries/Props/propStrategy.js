/** @typedef {"circle" | "box"} PropCollisionShape */

/** Shared defaults for world prop strategies (Pickup reads these via buildWorldPropStrategy). */
export const PROP_STRATEGY_DEFAULTS = {
    isPushable: false,
    renderMode: "3d",
    render3DKey: null,
    inspectKey: null,
    isExplosive: false,
    laserTargetable: false,
    mass: 1,
    friction: 8,
    wallPhysics: null,
    maxHealth: null,
    /** @type {PropCollisionShape} */
    collisionShape: "circle",
    rolls: false,
    /** @type {"ground" | "long"} ground = sphere-style; long = cylinder/log tumble about local long axis */
    rollAxis: "ground",
    rollHeight: null,
    splittable: false,
    randomFaceLabels: false,
    onFire: null,
    onFireRender3DKey: null,
};

/**
 * @param {object} strategy
 */
export function withPropStrategyDefaults(strategy) {
    return { ...PROP_STRATEGY_DEFAULTS, ...strategy };
}
