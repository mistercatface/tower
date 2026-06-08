import { getPropAsset } from "../../Props/PropCatalog.js";
import { wakePushableBody } from "../../Motion/pushableSleep.js";
export const ROLL_TO_CURSOR_HPA_BEHAVIOR_ID = "rollToCursorHpa";
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorHpaBehavior() {
    let targetWorld = null;
    let active = false;
    let path = null;
    let lastReplanTime = 0;
    let lastTargetX = null;
    let lastTargetY = null;
    let pathProgressIdx = 0;
    const REPLAN_INTERVAL_MS = 150;
    return {
        id: ROLL_TO_CURSOR_HPA_BEHAVIOR_ID,
        isEligible(asset) {
            return true; // Eligible for all sandbox props
        },
        onPointerDown(pickup, world) {
            active = true;
            targetWorld = { x: world.x, y: world.y };
            path = null;
            lastReplanTime = 0;
            pathProgressIdx = 0;
            return true;
        },
        onPointerMove(pickup, world) {
            if (!active) return;
            targetWorld = { x: world.x, y: world.y };
        },
        onPointerUp(pickup) {
            active = false;
            targetWorld = null;
            path = null;
        },
        tick(pickup, dt, host) {
            if (!active || !targetWorld) return;
            const config = { maxSpeed: 180, accel: 600, stopRadius: 8, waypointArrival: Math.max(12, (pickup.radius ?? 6) * 1.5), ...pickup.strategy?.rollToCursor };
            const now = Date.now();
            const targetMoved = lastTargetX !== targetWorld.x || lastTargetY !== targetWorld.y;
            const needsReplan = !path || now - lastReplanTime > REPLAN_INTERVAL_MS || targetMoved;
            if (needsReplan && host.computePath) {
                const result = host.computePath(pickup.x, pickup.y, targetWorld.x, targetWorld.y);
                path = result?.waypoints ?? null;
                lastReplanTime = now;
                lastTargetX = targetWorld.x;
                lastTargetY = targetWorld.y;
                pathProgressIdx = 0;
            }
            if (!path || path.length === 0) {
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
            // Advance waypoints along the path
            while (pathProgressIdx < path.length) {
                const wp = path[pathProgressIdx];
                const distToWp = Math.hypot(wp.x - pickup.x, wp.y - pickup.y);
                if (distToWp < config.waypointArrival && pathProgressIdx < path.length - 1) pathProgressIdx++;
                else break;
            }
            const activeWp = path[Math.min(pathProgressIdx, path.length - 1)];
            const dx = activeWp.x - pickup.x;
            const dy = activeWp.y - pickup.y;
            const dist = Math.hypot(dx, dy);
            // If we are at the final waypoint and close enough, stop
            const isFinalWp = pathProgressIdx >= path.length - 1;
            if (isFinalWp && dist < config.stopRadius) {
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
            if (dist > 0.1) {
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
            // Draw the HPA path waypoints and lines
            if (path && path.length > 0) {
                ctx.strokeStyle = "rgba(156, 39, 176, 0.6)"; // Purple for HPA
                ctx.lineWidth = 2 * lineScale;
                ctx.beginPath();
                ctx.moveTo(pickup.x, pickup.y);
                for (let i = pathProgressIdx; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
                ctx.stroke();
                // Draw waypoint nodes
                ctx.fillStyle = "rgba(156, 39, 176, 0.8)";
                for (let i = pathProgressIdx; i < path.length; i++) {
                    ctx.beginPath();
                    ctx.arc(path[i].x, path[i].y, 3 * lineScale, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            // Draw target cursor
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
            path = null;
        },
    };
}
