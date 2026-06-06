/** Muzzle position in world space — mirrors weapon draw + sprite placement. */
export function calculateMuzzleCanvasOffset(aimAngle, handScale, config, barrelRatio) {
    const size = config.SIZE;
    const offsetX = 0.01;
    const offsetY = -0.03;
    const localX = (offsetX + barrelRatio) * size * handScale;
    const localY = offsetY * size * handScale;
    const isFlipped = Math.cos(aimAngle) < 0;
    const flippedY = isFlipped ? -localY : localY;
    const c = Math.cos(aimAngle);
    const s = Math.sin(aimAngle);
    return { x: localX * c - flippedY * s, y: localX * s + flippedY * c };
}
export function spriteMetricsFromConfig(config) {
    const canvasSize = config.SIZE + config.PADDING * 2;
    const feetYInCanvas = config.PADDING + config.ANCHOR_Y * config.SIZE;
    return { width: canvasSize, height: canvasSize, drawRatio: canvasSize / config.SIZE, verticalShift: feetYInCanvas - canvasSize / 2, padding: config.PADDING };
}
export function kinematicsInnerPointToWorld(actor, innerX, innerY, metrics, displayDiameter) {
    const canvasX = innerX + metrics.padding;
    const canvasY = innerY + metrics.padding;
    const drawW = displayDiameter * metrics.drawRatio;
    const drawH = drawW;
    const vShift = metrics.verticalShift * (drawW / metrics.width);
    return { x: actor.x - drawW / 2 + (canvasX / metrics.width) * drawW, y: actor.y - drawH / 2 - vShift + (canvasY / metrics.height) * drawH };
}
/**
 * @param {ReturnType<import("./createWeaponVisuals.js").createWeaponVisuals>} weaponVisuals
 */
export function createMuzzleResolver(weaponVisuals) {
    return function resolveMuzzleFromRig(actor, rigData, project, config, facing, turretIndex, displayDiameter) {
        const slots = weaponVisuals.resolveWeaponDrawSlots(actor);
        const slot = slots.find((s) => s.turretIndex === turretIndex) ?? slots[0];
        if (!slot) return null;
        const turrets = actor.turrets ?? [];
        const turret = turrets[turretIndex] ?? turrets[0];
        if (!turret) return null;
        const hand = weaponVisuals.resolveProjectedHandsForSlot(rigData, slot, project);
        const aimAngle = facing.gunCanvasAim(turret.angle);
        const barrelRatio = weaponVisuals.getBarrelRatioForGunId(slot.gunId);
        const offset = calculateMuzzleCanvasOffset(aimAngle, hand.scale ?? 1, config, barrelRatio);
        const metrics = spriteMetricsFromConfig(config);
        return kinematicsInnerPointToWorld(actor, hand.x + offset.x, hand.y + offset.y, metrics, displayDiameter);
    };
}
