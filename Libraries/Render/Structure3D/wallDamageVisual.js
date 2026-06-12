/** @param {number} health @param {number} maxHealth */
export function getDamageAlphaFromHealth(health, maxHealth) {
    const healthRatio = health / maxHealth;
    return healthRatio < 1 ? (1 - healthRatio) * 0.45 : 0;
}
/** @param {number} damageAlpha */
export function wallDamageOverlayStyle(damageAlpha) {
    return `rgba(244, 67, 54, ${damageAlpha})`;
}
