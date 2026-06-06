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
    /** @type {"ground" | "long"} ground = sphere; long = log or stand-tip box (barrel) */
    rollAxis: "ground",
    /** Standing props that tip via rollAngle (0 upright → π/2 flat), then tumble like logs. */
    standTip: false,
    rollHeight: null,
    uprightHeight: null,
    tipPushSpeed: 9,
    tipFallAngle: null,
    tipGravity: 16,
    tipDamping: 2.8,
    tipImpulseGain: 0.035,
    actorTipGain: 0.2,
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
