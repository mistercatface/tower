export function resolveRangedWeapon(instance, profile) {
    return instance?.equippedWeapon ?? profile?.weapon ?? null;
}
export function hasRangedCombatCapability(instance, profile) {
    return !!(resolveRangedWeapon(instance, profile) || profile?.decision?.modes?.shoot_enemy);
}
