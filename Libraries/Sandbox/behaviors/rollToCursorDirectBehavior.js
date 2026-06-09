import { decelerateRoll, getRollToCursorConfig, steerRollToward } from "../rollToCursorMotion.js";
export const ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID = "rollToCursorDirect";
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorDirectBehavior() {
    let targetWorld = null;
    let active = false;
    return {
        id: ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID,
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
            const config = getRollToCursorConfig(pickup);
            const dx = targetWorld.x - pickup.x;
            const dy = targetWorld.y - pickup.y;
            const dist = Math.hypot(dx, dy);
            if (dist < config.stopRadius) {
                decelerateRoll(pickup, dt, config);
                return;
            }
            steerRollToward(pickup, dx / dist, dy / dist, dt, config);
        },
        getPathOverlay(pickup) {
            if (!active || !targetWorld) return null;
            return { mode: "direct", fromX: pickup.x, fromY: pickup.y, targetX: targetWorld.x, targetY: targetWorld.y };
        },
        reset() {
            active = false;
            targetWorld = null;
        },
    };
}
