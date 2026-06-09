/** @param {object} seg */
export function getWallHealthRatio(seg) {
    return Math.max(0, Math.round((seg.health / seg.maxHealth) * 10) / 10);
}
/** @param {object} seg */
export function getWallDamageAlpha(seg) {
    const healthRatio = seg.health / seg.maxHealth;
    return healthRatio < 1 ? (1 - healthRatio) * 0.45 : 0;
}
/** @param {object} seg @param {number} [darkenRatio] */
export function getWallDamageColor(seg, darkenRatio = 1.0) {
    const healthRatio = getWallHealthRatio(seg);
    const baseR = 245;
    const baseG = 245;
    const baseB = 247;
    const r = Math.floor((baseR + (244 - baseR) * (1 - healthRatio)) * darkenRatio);
    const g = Math.floor((baseG + (67 - baseG) * (1 - healthRatio)) * darkenRatio);
    const b = Math.floor((baseB + (54 - baseB) * (1 - healthRatio)) * darkenRatio);
    return `rgb(${r}, ${g}, ${b})`;
}
/** @param {number} damageAlpha */
export function wallDamageOverlayStyle(damageAlpha) {
    return `rgba(244, 67, 54, ${damageAlpha})`;
}
