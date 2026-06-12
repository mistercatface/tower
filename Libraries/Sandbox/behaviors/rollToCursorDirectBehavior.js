import { decelerateRoll, getRollToCursorConfig, steerRollToward } from "../rollToCursorMotion.js";
export const ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID = "rollToCursorDirect";
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorDirectBehavior() {
    let targetWorld = null;
    let active = false;
    return {
        id: ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID,
        onPointerDown(prop, world) {
            active = true;
            targetWorld = { x: world.x, y: world.y };
            return true;
        },
        onPointerMove(prop, world) {
            if (!active) return;
            targetWorld = { x: world.x, y: world.y };
        },
        onPointerUp(prop) {
            active = false;
            targetWorld = null;
        },
        tick(prop, dt) {
            if (!active || !targetWorld) return;
            const config = getRollToCursorConfig(prop);
            const dx = targetWorld.x - prop.x;
            const dy = targetWorld.y - prop.y;
            const dist = Math.hypot(dx, dy);
            if (dist < config.stopRadius) {
                decelerateRoll(prop, dt, config);
                return;
            }
            steerRollToward(prop, dx / dist, dy / dist, dt, config);
        },
        getPathOverlay(prop) {
            if (!active || !targetWorld) return null;
            return { mode: "direct", fromX: prop.x, fromY: prop.y, targetX: targetWorld.x, targetY: targetWorld.y };
        },
        reset() {
            active = false;
            targetWorld = null;
        },
    };
}
