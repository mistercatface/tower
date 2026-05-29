export function getProjectileDamage(projectile) {
    return projectile.damage;
}

export function getBeamTickDamage(gun) {
    return gun.tickDamage;
}

/** Hit payload for beam ticks on props (pickup onHit). */
export function createBeamHitSource(gun) {
    return { damage: gun.tickDamage };
}
