/**
 * @typedef {number | { base?: number, swaySpeed?: number, swayAmp?: number }} ArmChannelDef
 */

/**
 * @typedef {object} StaticPoseDef
 * @property {{ spreadX?: number, offsetX?: number, rightOffsetX?: number, leftOffsetX?: number }} [feet]
 * @property {{ lift?: number, leanBase?: number, leanRange?: number, leanSpeed?: number, bobRange?: number, bobSpeed?: number }} [body]
 * @property {{ rotation?: { bodyOffset?: number } }} [rotation]
 * @property {Record<string, ArmChannelDef>} [arms]
 */

/**
 * @param {ArmChannelDef} value
 * @param {number} cycle
 */
function resolveArmChannel(value, cycle) {
    if (typeof value === "number") return value;
    const base = value.base ?? 0;
    const speed = value.swaySpeed ?? 0;
    const amp = value.swayAmp ?? 0;
    if (speed === 0 || amp === 0) return base;
    return base + Math.sin(cycle * speed) * amp;
}

/**
 * @param {string} name
 * @param {StaticPoseDef} def
 * @param {object} rig
 */
export function buildStaticPose(name, def, rig) {
    const feet = def.feet ?? {};
    const body = def.body ?? {};
    const arms = def.arms ?? {};

    return {
        name,
        rotation: { bodyOffset: def.rotation?.bodyOffset ?? 0 },
        getTargets() {
            const spreadX = feet.spreadX ?? 0.015;
            const offsetX = feet.offsetX ?? 0;
            const rightOffsetX = feet.rightOffsetX ?? (offsetX - spreadX);
            const leftOffsetX = feet.leftOffsetX ?? (offsetX + spreadX);
            return {
                rightFoot: { x: rig.size * rightOffsetX, y: rig.groundY },
                leftFoot: { x: rig.size * leftOffsetX, y: rig.groundY },
            };
        },
        getModifiers(cycle) {
            const lift = (body.lift ?? 0) * rig.size;
            const leanBase = body.leanBase ?? 0;
            const leanRange = body.leanRange ?? 0;
            const leanSpeed = body.leanSpeed ?? 0.5;
            const bobRange = body.bobRange ?? 0.008;
            const bobSpeed = body.bobSpeed ?? 1.5;
            return {
                lift,
                lean: leanBase + Math.sin(cycle * leanSpeed) * leanRange,
                bob: Math.sin(cycle * bobSpeed) * (rig.size * bobRange),
            };
        },
        getArmAngles(cycle) {
            /** @type {Record<string, number>} */
            const out = {};
            for (const [key, value] of Object.entries(arms)) {
                out[key] = resolveArmChannel(value, cycle);
            }
            return out;
        },
    };
}

/**
 * @param {Record<string, StaticPoseDef>} defs
 * @param {object} rig
 */
export function buildStaticPoses(defs, rig) {
    /** @type {Record<string, ReturnType<typeof buildStaticPose>>} */
    const poses = {};
    for (const [name, def] of Object.entries(defs)) {
        poses[name] = buildStaticPose(name, def, rig);
    }
    return poses;
}
