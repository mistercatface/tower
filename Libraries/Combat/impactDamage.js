export function getProjectileDamage(projectile) {
    return Math.round(projectile.damage);
}
export function getBeamTickDamage(gun) {
    return Math.round(gun.tickDamage);
}
/** Hit payload for beam ticks on props (prop onHit). */
export function createBeamHitSource(gun) {
    return { damage: getBeamTickDamage(gun) };
}
