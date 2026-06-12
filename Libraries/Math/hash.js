/** @param {string} str @returns {number} uint32 FNV-1a hash */
export function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    return h >>> 0;
}
/** @param {number} a @param {number} b @param {number} c @param {number} d @returns {number} uint32 mixed hash */
export function mixHash4(a, b, c, d) {
    let h = a | 0;
    h = Math.imul(h ^ b, 0x9e3779b1);
    h = Math.imul(h ^ c, 0x9e3779b1);
    h = Math.imul(h ^ d, 0x9e3779b1);
    return h >>> 0;
}
