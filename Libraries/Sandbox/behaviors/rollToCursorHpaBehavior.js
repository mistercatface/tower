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
        getPathOverlay(pickup) {
            if (!active || !targetWorld) return null;
            return {
                mode: "hpa",
                fromX: pickup.x,
                fromY: pickup.y,
                targetX: targetWorld.x,
                targetY: targetWorld.y,
                waypoints: hpaNav.navState.path ?? undefined,
                abstractPath: hpaNav.navState.abstractPath ?? undefined,
            };
        },
        reset() {
            active = false;
            targetWorld = null;
            hpaNav.reset();
        },
    };
}
