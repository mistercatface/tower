import { getPropAsset } from "../../Props/PropCatalog.js";
import { wakePushableBody } from "../../Motion/pushableSleep.js";
export const ROLL_TO_CURSOR_BEHAVIOR_ID = "rollToCursor";
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorBehavior() {
    let targetWorld = null;
    let active = false;
    return {
        id: ROLL_TO_CURSOR_BEHAVIOR_ID,
        isEligible(asset) {
            return true; // Eligible for all sandbox props
        },
        onPointerDown(pickup, world) {
            active = true;
            targetWorld = { x: world.x, y: world.y };
            return true;
        },
        onPointerMove(pickup, world) {
            if (!active) return;
            targetWorld = { x: world.x, y: world.y };
        },
        onPointerUp(pickup) {
            active = false;
            targetWorld = null;
        },
        tick(pickup, dt) {
            if (!active || !targetWorld) return;
            const dx = targetWorld.x - pickup.x;
            const dy = targetWorld.y - pickup.y;
            const dist = Math.hypot(dx, dy);
            const config = { maxSpeed: 180, accel: 600, stopRadius: 6, ...pickup.strategy?.rollToCursor };
            if (dist < config.stopRadius) {
                const speed = Math.hypot(pickup.vx, pickup.vy);
                if (speed > 0) {
                    const decel = config.accel * dt * 2;
                    if (speed <= decel) {
                        pickup.vx = 0;
                        pickup.vy = 0;
                        pickup.angularVelocity = 0;
                    } else {
                        pickup.vx -= (pickup.vx / speed) * decel;
                        pickup.vy -= (pickup.vy / speed) * decel;
                        if (pickup.strategy?.rolls) pickup.angularVelocity = (speed / (pickup.radius || 8)) * 0.12;
                    }
                    wakePushableBody(pickup);
                }
                return;
            }
            const nx = dx / dist;
            const ny = dy / dist;
            const targetVx = nx * config.maxSpeed;
            const targetVy = ny * config.maxSpeed;
            const dvx = targetVx - pickup.vx;
            const dvy = targetVy - pickup.vy;
            const diff = Math.hypot(dvx, dvy);
            if (diff > 0) {
                const step = config.accel * dt;
                if (diff <= step) {
                    pickup.vx = targetVx;
                    pickup.vy = targetVy;
                } else {
                    pickup.vx += (dvx / diff) * step;
                    pickup.vy += (dvy / diff) * step;
                }
            }
            if (pickup.strategy?.rolls) {
                const speed = Math.hypot(pickup.vx, pickup.vy);
                pickup.angularVelocity = (speed / (pickup.radius || 8)) * 0.12;
            }
            wakePushableBody(pickup);
        },
        drawOverlay(ctx, pickup) {
            if (!active || !targetWorld) return;
            const lineScale = 1 / Math.max(0.001, ctx.getTransform().a);
            ctx.save();
            ctx.strokeStyle = "rgba(0, 188, 212, 0.5)";
            ctx.lineWidth = 1.5 * lineScale;
            ctx.setLineDash([4 * lineScale, 4 * lineScale]);
            ctx.beginPath();
            ctx.moveTo(pickup.x, pickup.y);
            ctx.lineTo(targetWorld.x, targetWorld.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = "rgba(0, 188, 212, 0.8)";
            ctx.lineWidth = 2 * lineScale;
            ctx.beginPath();
            ctx.arc(targetWorld.x, targetWorld.y, 4 * lineScale, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        },
        reset() {
            active = false;
            targetWorld = null;
        },
    };
}
