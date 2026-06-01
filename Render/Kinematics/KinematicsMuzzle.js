/** Muzzle position in world space — mirrors weapon draw + sprite placement. */

import { getBarrelRatioForGunId, getHandProjected, resolveWeaponDrawSlots } from "./KinematicsWeaponVisuals.js";

/** Canvas-space offset from hand to barrel tip (matches drawPistol / drawLongGun transforms). */
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
    return {
        x: localX * c - flippedY * s,
        y: localX * s + flippedY * c,
    };
}

export function spriteMetricsFromConfig(config) {
    const canvasSize = config.SIZE + config.PADDING * 2;
    const feetYInCanvas = config.PADDING + config.ANCHOR_Y * config.SIZE;
    return {
        width: canvasSize,
        height: canvasSize,
        drawRatio: canvasSize / config.SIZE,
        verticalShift: feetYInCanvas - canvasSize / 2,
        padding: config.PADDING,
    };
}

/** Inverse of renderActorKinematicsBody drawImage placement. */
export function kinematicsInnerPointToWorld(actor, innerX, innerY, metrics, displayDiameter) {
    const canvasX = innerX + metrics.padding;
    const canvasY = innerY + metrics.padding;
    const drawW = displayDiameter * metrics.drawRatio;
    const drawH = drawW;
    const vShift = metrics.verticalShift * (drawW / metrics.width);

    return {
        x: actor.x - drawW / 2 + (canvasX / metrics.width) * drawW,
        y: actor.y - drawH / 2 - vShift + (canvasY / metrics.height) * drawH,
    };
}

export function resolveHandForWeaponSlot(scene, slot) {
    if (slot.aimArms === "both") {
        const right = scene.rArm.p3;
        const left = scene.lArm.p3;
        return {
            x: (right.x + left.x) * 0.5,
            y: (right.y + left.y) * 0.5,
            scale: ((right.scale ?? 1) + (left.scale ?? 1)) * 0.5,
        };
    }
    const hand = getHandProjected(scene, slot.drawHand);
    return {
        x: hand.x,
        y: hand.y,
        scale: hand.scale ?? 1,
    };
}

export function resolveMuzzleFromScene(actor, scene, config, facing, turretIndex, displayDiameter) {
    const slots = resolveWeaponDrawSlots(actor);
    const slot = slots.find((s) => s.turretIndex === turretIndex) ?? slots[0];
    if (!slot) return null;

    const turrets = actor.turrets ?? [];
    const turret = turrets[turretIndex] ?? turrets[0];
    if (!turret) return null;

    const hand = resolveHandForWeaponSlot(scene, slot);
    const aimAngle = facing.gunCanvasAim(turret.angle);
    const barrelRatio = getBarrelRatioForGunId(slot.gunId);
    const offset = calculateMuzzleCanvasOffset(aimAngle, hand.scale, config, barrelRatio);
    const metrics = spriteMetricsFromConfig(config);

    return kinematicsInnerPointToWorld(
        actor,
        hand.x + offset.x,
        hand.y + offset.y,
        metrics,
        displayDiameter,
    );
}
