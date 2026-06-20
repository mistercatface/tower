/** @typedef {import("./kineticContactSolver.js").KineticContactBuffer} KineticContactBuffer */

export const FEATURE_ANGLE_BINS = 16;
const WARM_START_FEATURE_STRIDE = 32;

/**
 * Quantize contact normal into a stable feature bucket for warm-start keys.
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
 * Feature-id keyed warm-start cache entry for a body pair contact.
 * @param {number} pairKey
 * @param {number} nx
 * @param {number} ny
 * @returns {number}
 */
export function contactWarmStartKey(pairKey, nx, ny) {
    return pairKey * WARM_START_FEATURE_STRIDE + quantizeContactFeatureId(nx, ny);
}

/**
 * @param {KineticContactBuffer} contacts
 * @param {number} i
 * @param {{ kineticResting?: { normalVelocityEpsilon?: number, maxBodySpeed?: number } }} settings
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
