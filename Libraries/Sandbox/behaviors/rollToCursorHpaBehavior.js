import { createRollToCursorHpaNav } from "../rollToCursorHpaNav.js";
import { decelerateRoll, getRollToCursorConfig, steerRollToward } from "../rollToCursorMotion.js";
export const ROLL_TO_CURSOR_HPA_BEHAVIOR_ID = "rollToCursorHpa";
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorHpaBehavior() {
    let targetWorld = null;
    let active = false;
    const hpaNav = createRollToCursorHpaNav();
    return {
        id: ROLL_TO_CURSOR_HPA_BEHAVIOR_ID,
        isEligible(asset) {
            return true;
        },
        onPointerDown(pickup, world) {
            active = true;
            targetWorld = { x: world.x, y: world.y };
            hpaNav.reset();
            return true;
        },
        onPointerMove(pickup, world) {
            if (!active) return;
            targetWorld = { x: world.x, y: world.y };
        },
        onPointerUp(pickup) {
            active = false;
            targetWorld = null;
            hpaNav.reset();
        },
        tick(pickup, dt, host) {
            if (!active || !targetWorld) return;
            const config = getRollToCursorConfig(pickup, { stopRadius: 8 });
            hpaNav.update(pickup, targetWorld.x, targetWorld.y, host, dt * 1000);
            const steering = hpaNav.getSteering(pickup, targetWorld.x, targetWorld.y, {
                pathWaypointArrival: Math.max(12, (pickup.radius ?? 6) * 1.5),
                arrivalDistance: config.stopRadius,
                pathOffPathDistance: 80,
            });
            if (!steering || (steering.desiredX === 0 && steering.desiredY === 0)) {
                decelerateRoll(pickup, dt, config);
                return;
            }
            steerRollToward(pickup, steering.desiredX, steering.desiredY, dt, config);
        },
        drawOverlay(ctx, pickup) {
            if (!active || !targetWorld) return;
            const lineScale = 1 / Math.max(0.001, ctx.getTransform().a);
            const path = hpaNav.navState.path;
            ctx.save();
            if (path && path.length > 0) {
                ctx.strokeStyle = "rgba(156, 39, 176, 0.6)";
                ctx.lineWidth = 2 * lineScale;
                ctx.beginPath();
                ctx.moveTo(pickup.x, pickup.y);
                for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
                ctx.stroke();
                ctx.fillStyle = "rgba(156, 39, 176, 0.8)";
                for (let i = 1; i < path.length; i++) {
                    ctx.beginPath();
                    ctx.arc(path[i].x, path[i].y, 3 * lineScale, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.strokeStyle = "rgba(156, 39, 176, 0.9)";
            ctx.lineWidth = 2 * lineScale;
            ctx.beginPath();
            ctx.arc(targetWorld.x, targetWorld.y, 5 * lineScale, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        },
        reset() {
            active = false;
            targetWorld = null;
            hpaNav.reset();
        },
    };
}
