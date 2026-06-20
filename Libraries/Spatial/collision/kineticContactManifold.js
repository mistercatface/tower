export const PAIR_KEY_SCALE = 1_000_000;
export const FEATURE_ANGLE_BINS = 16;
export const WARM_START_CACHE_MASK = 16383;
const WARM_START_FEATURE_STRIDE = 32;
/**
 * @param {{ id: number }} bodyA
 * @param {{ id: number }} bodyB
 * @returns {number}
 */
export function pairContactKey(bodyA, bodyB) {
    return bodyA.id < bodyB.id ? bodyA.id * PAIR_KEY_SCALE + bodyB.id : bodyB.id * PAIR_KEY_SCALE + bodyA.id;
}
/**
 * @param {number} nx
 * @param {number} ny
 * @returns {number}
 */
export function quantizeContactFeatureId(nx, ny) {
    if (Math.abs(nx) < 1e-8 && Math.abs(ny) < 1e-8) return 0;
    const angle = Math.atan2(ny, nx);
    const bin = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * FEATURE_ANGLE_BINS) % FEATURE_ANGLE_BINS;
    return bin + 1;
}
/**
 * @param {{ id: number }} bodyA
 * @param {{ id: number }} bodyB
 * @param {number} nx
 * @param {number} ny
 * @returns {number}
 */
export function contactWarmStartKey(bodyA, bodyB, nx, ny) {
    return pairContactKey(bodyA, bodyB) * WARM_START_FEATURE_STRIDE + quantizeContactFeatureId(nx, ny);
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
