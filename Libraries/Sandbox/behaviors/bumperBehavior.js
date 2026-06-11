import { applyImpulse } from "../../Motion/applyImpulse.js";
import { wakePushableBody } from "../../Motion/pushableSleep.js";
export const BUMPER_BEHAVIOR_ID = "bumper";
const SWING_DURATION_MS = 220;
const SWING_RADIUS = 40;
const SWING_FORCE = 1800;
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createBumperBehavior() {
    let swingTimeMs = 0;
    let swingActive = false;
    const swing = (pickup, host) => {
        if (!pickup) return;
        swingActive = true;
        swingTimeMs = 0;
        wakePushableBody(pickup);
        const pickups = host.getPickups();
        for (let i = 0; i < pickups.length; i++) {
            const other = pickups[i];
            if (other === pickup || other.isDead || other.isSleeping) continue;
            const dx = other.x - pickup.x;
            const dy = other.y - pickup.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= 0 || dist > SWING_RADIUS + (other.radius ?? 0) + pickup.radius) continue;
            const nx = dx / dist;
            const ny = dy / dist;
            applyImpulse(other, nx * SWING_FORCE, ny * SWING_FORCE);
            wakePushableBody(other);
        }
    };
    return {
        id: BUMPER_BEHAVIOR_ID,
        supports(_pickup, asset) {
            return asset?.sandbox?.behaviors?.includes(BUMPER_BEHAVIOR_ID) ?? false;
        },
        onPointerDown(_pickup, _world, _e, _host) {
            return false;
        },
        onPointerMove() {},
        onPointerUp() {},
        tick(pickup, dt) {
            if (!swingActive) return;
            swingTimeMs += dt;
            if (swingTimeMs >= SWING_DURATION_MS) swingActive = false;
        },
        drawOverlay(ctx, pickup) {
            if (!swingActive || !pickup) return;
            const t = Math.min(1, swingTimeMs / SWING_DURATION_MS);
            const alpha = 1 - t;
            const ringRadius = pickup.radius + SWING_RADIUS * t;
            const lineScale = 1 / Math.max(0.001, ctx.getTransform().a);
            ctx.save();
            ctx.beginPath();
            ctx.arc(pickup.x, pickup.y, ringRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 80, 80, ${alpha * 0.85})`;
            ctx.lineWidth = 3 * lineScale;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(pickup.x, pickup.y, ringRadius * 0.6, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 180, 180, ${alpha * 0.4})`;
            ctx.lineWidth = 2 * lineScale;
            ctx.stroke();
            ctx.restore();
        },
        getActions(pickup, host) {
            return [{ label: "Swing!", onTrigger: () => swing(pickup, host) }];
        },
        reset() {
            swingActive = false;
            swingTimeMs = 0;
        },
    };
}
