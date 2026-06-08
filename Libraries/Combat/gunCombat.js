export function getSlotFireIntervalMs(gun, actor) {
    const multiplier = actor?.stats?.fireIntervalMultiplier?.value ?? 1;
    return gun.fireIntervalMs * multiplier;
}
export function getSlotReloadTimeMs(gun, actor) {
    const speedMultiplier = actor?.stats?.reloadSpeedMultiplier?.value ?? 1;
    return gun.reloadTimeMs / Math.max(speedMultiplier, 0.01);
}
export function getGunProjectileConfig(gun) {
    if (gun?.projectile) return gun.projectile;
    throw new Error(`Gun "${gun?.id ?? "unknown"}" is missing projectile config`);
}
