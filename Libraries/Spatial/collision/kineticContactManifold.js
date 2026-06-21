export const PAIR_KEY_SCALE = 1_000_000;
export const WARM_START_CACHE_MASK = 16383;
const WARM_START_FEATURE_STRIDE = 1024;
const FEATURE_ANGLE_BUCKETS = 32;
export function quantizeContactFeatureId(nx, ny) {
    if (nx === 0 && ny === 0) return 0;
    const angle = Math.atan2(ny, nx);
    let bucket = Math.round((angle / (Math.PI * 2)) * FEATURE_ANGLE_BUCKETS);
    if (bucket < 0) bucket += FEATURE_ANGLE_BUCKETS;
    if (bucket >= FEATURE_ANGLE_BUCKETS) bucket = 0;
    return bucket & 0x1f;
}
export function pairContactKey(bodyA, bodyB) {
    return bodyA.id < bodyB.id ? bodyA.id * PAIR_KEY_SCALE + bodyB.id : bodyB.id * PAIR_KEY_SCALE + bodyA.id;
}
/**
 * @param {{ id: number }} bodyA
 * @param {{ id: number }} bodyB
 * @param {number} featureA
 * @param {number} featureB
 * @returns {number}
 */
export function contactWarmStartKey(bodyA, bodyB, featureA = 0, featureB = 0) {
    const isAFirst = bodyA.id < bodyB.id;
    const f1 = isAFirst ? featureA : featureB;
    const f2 = isAFirst ? featureB : featureA;
    const featureKey = (f1 & 0x1f) | ((f2 & 0x1f) << 5);
    return pairContactKey(bodyA, bodyB) * WARM_START_FEATURE_STRIDE + featureKey;
}
export function contactWarmStartKeyFromPairKey(pairKey, featureA = 0, featureB = 0) {
    const featureKey = (featureA & 0x1f) | ((featureB & 0x1f) << 5);
    return pairKey * WARM_START_FEATURE_STRIDE + featureKey;
}
/** @param {number} warmStartKey */
export function warmStartCacheIndex(warmStartKey) {
    return (Math.trunc(warmStartKey / PAIR_KEY_SCALE) ^ (warmStartKey % PAIR_KEY_SCALE)) & WARM_START_CACHE_MASK;
}
/**
 * @param {{ preDvx: Float32Array, preDvy: Float32Array, nx: Float32Array, ny: Float32Array }} contacts
 * @param {number} i
 * @param {{ kineticResting?: { normalVelocityEpsilon?: number, tangentVelocityEpsilon?: number } }} settings
 * @returns {boolean}
 */
export function isRestingKineticContact(contacts, i, settings) {
    const resting = settings.kineticResting ?? {};
    const nx = contacts.nx[i];
    const ny = contacts.ny[i];
    const preN = contacts.preDvx[i] * nx + contacts.preDvy[i] * ny;
    const preT = contacts.preDvx[i] * -ny + contacts.preDvy[i] * nx;
    const normalEps = resting.normalVelocityEpsilon ?? 0.05;
    const tangentEps = resting.tangentVelocityEpsilon ?? 0.05;
    const velSlack = 1e-4;
    return Math.abs(preN) <= normalEps + velSlack && Math.abs(preT) <= tangentEps + velSlack;
}
