import { createRollToCursorHpaNav } from "../rollToCursorHpaNav.js";
import { decelerateRoll, getRollToCursorConfig, steerRollToward } from "../rollToCursorMotion.js";
export const ROLL_TO_CURSOR_HPA_BEHAVIOR_ID = "rollToCursorHpa";
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorHpaBehavior() {
    let targetWorld = null;
    let dragging = false;
    const hpaNav = createRollToCursorHpaNav();
    const clearTarget = () => {
        targetWorld = null;
        dragging = false;
        hpaNav.reset();
    };
    return {
        id: ROLL_TO_CURSOR_HPA_BEHAVIOR_ID,
        onPointerDown(pickup, world) {
            dragging = true;
            targetWorld = { x: world.x, y: world.y };
            hpaNav.reset();
            return true;
        },
        onPointerMove(pickup, world) {
            if (!dragging || !targetWorld) return;
            targetWorld = { x: world.x, y: world.y };
        },
        onPointerUp() {
            dragging = false;
        },
        tick(pickup, dt, host) {
            if (!targetWorld) return;
            const config = getRollToCursorConfig(pickup, { stopRadius: 8 });
            const distToTarget = Math.hypot(targetWorld.x - pickup.x, targetWorld.y - pickup.y);
            if (distToTarget <= config.stopRadius) {
                decelerateRoll(pickup, dt, config);
                const speed = Math.hypot(pickup.vx ?? 0, pickup.vy ?? 0);
                if (speed < 0.5) clearTarget();
                return;
            }
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
        getPathOverlay(pickup) {
            if (!targetWorld) return null;
            return {
                mode: "hpa",
                fromX: pickup.x,
                fromY: pickup.y,
                targetX: targetWorld.x,
                targetY: targetWorld.y,
                waypoints: hpaNav.navState.path ?? undefined,
                abstractPath: hpaNav.navState.abstractPath ?? undefined,
                pathPlanner: hpaNav.navState.pathPlanner ?? undefined,
            };
        },
        reset() {
            clearTarget();
        },
    };
}
