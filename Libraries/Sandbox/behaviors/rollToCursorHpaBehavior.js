import { createRollToCursorHpaNav } from "../rollToCursorHpaNav.js";
import { decelerateRoll, getRollToCursorConfig, steerRollToward } from "../rollToCursorMotion.js";
export const ROLL_TO_CURSOR_HPA_BEHAVIOR_ID = "rollToCursorHpa";
/** @param {object} state @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorHpaBehavior(state) {
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
        onPointerDown(prop, world) {
            dragging = true;
            targetWorld = { x: world.x, y: world.y };
            hpaNav.reset();
            return true;
        },
        onPointerMove(prop, world) {
            if (!dragging || !targetWorld) return;
            targetWorld = { x: world.x, y: world.y };
        },
        onPointerUp() {
            dragging = false;
        },
        setGroundMoveTarget(_prop, world) {
            dragging = false;
            targetWorld = { x: world.x, y: world.y };
            hpaNav.reset();
        },
        updateGroundMoveTarget(_prop, world) {
            if (!targetWorld) return;
            targetWorld = { x: world.x, y: world.y };
        },
        tick(prop, dt) {
            if (!targetWorld) return;
            const config = getRollToCursorConfig(prop, { stopRadius: 8 });
            const distToTarget = Math.hypot(targetWorld.x - prop.x, targetWorld.y - prop.y);
            const isFinalLeg = !hpaNav.navState.path || hpaNav.navState.pathProgressIdx >= hpaNav.navState.path.length - 1;
            if (isFinalLeg && distToTarget <= config.stopRadius) {
                decelerateRoll(prop, dt, config);
                const speed = Math.hypot(prop.vx ?? 0, prop.vy ?? 0);
                if (speed < 0.5) clearTarget();
                return;
            }
            hpaNav.update(prop, targetWorld.x, targetWorld.y, state, dt * 1000);
            const steering = hpaNav.getSteering(prop, targetWorld.x, targetWorld.y, {
                pathWaypointArrival: Math.max(12, (prop.radius ?? 6) * 1.5),
                arrivalDistance: config.stopRadius,
                pathOffPathDistance: 80,
            });
            if (!steering || (steering.desiredX === 0 && steering.desiredY === 0)) {
                decelerateRoll(prop, dt, config);
                return;
            }
            steerRollToward(prop, steering.desiredX, steering.desiredY, dt, config);
        },
        getPathOverlay(prop) {
            if (!targetWorld) return null;
            return {
                mode: "hpa",
                fromX: prop.x,
                fromY: prop.y,
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
