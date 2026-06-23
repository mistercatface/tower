/** @param {string} str @returns {number} uint32 FNV-1a hash */
export function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    return h >>> 0;
}
/**
 * Derive a uint32 sub-seed from a root seed and salt string (procedural / noise).
 * Not FNV — uses Knuth-style multiplier for stable field/noise derivation.
 * @param {number} rootSeed
 * @param {string} salt
 * @returns {number}
 */
export function hashSaltString(rootSeed, salt) {
    let h = rootSeed >>> 0 || 1;
    for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 2654435761) >>> 0;
    return h || 1;
}
/** @param {number} a @param {number} b @param {number} c @param {number} d @returns {number} uint32 mixed hash */
export function mixHash4(a, b, c, d) {
    let h = a | 0;
    h = Math.imul(h ^ b, 0x9e3779b1);
    h = Math.imul(h ^ c, 0x9e3779b1);
    h = Math.imul(h ^ d, 0x9e3779b1);
    return h >>> 0;
}
