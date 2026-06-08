import { decelerateRoll, drawRollTargetOverlay, getRollToCursorConfig, steerRollToward } from "../rollToCursorMotion.js";
export const ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID = "rollToCursorDirect";
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorDirectBehavior() {
    let targetWorld = null;
    let active = false;
    return {
        id: ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID,
        isEligible(asset) {
            return true;
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
        drawOverlay(ctx, pickup) {
            if (!active || !targetWorld) return;
            drawRollTargetOverlay(ctx, pickup.x, pickup.y, targetWorld.x, targetWorld.y, { lineColor: "rgba(0, 188, 212, 0.5)", markerColor: "rgba(0, 188, 212, 0.8)", dashed: true });
        },
        reset() {
            active = false;
            targetWorld = null;
        },
    };
}
