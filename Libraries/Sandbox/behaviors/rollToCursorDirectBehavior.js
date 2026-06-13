import { decelerateRoll, getRollToCursorConfig, steerRollToward, releaseRollMoveTarget } from "../rollToCursorMotion.js";
export const ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID = "rollToCursorDirect";
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorDirectBehavior() {
    let targetWorld = null;
    let unitDragActive = false;
    let groundMoveActive = false;
    const clearTarget = () => {
        targetWorld = null;
        unitDragActive = false;
        groundMoveActive = false;
    };
    return {
        id: ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID,
        onPointerDown(prop, world) {
            unitDragActive = true;
            groundMoveActive = false;
            targetWorld = { x: world.x, y: world.y };
            return true;
        },
        onPointerMove(prop, world) {
            if (!unitDragActive) return;
            targetWorld = { x: world.x, y: world.y };
        },
        onPointerUp() {
            unitDragActive = false;
            if (!groundMoveActive) targetWorld = null;
        },
        setGroundMoveTarget(_prop, world) {
            unitDragActive = false;
            groundMoveActive = true;
            targetWorld = { x: world.x, y: world.y };
        },
        updateGroundMoveTarget(_prop, world) {
            if (!groundMoveActive || !targetWorld) return;
            targetWorld = { x: world.x, y: world.y };
        },
        tick(prop, dt) {
            if (!targetWorld || (!unitDragActive && !groundMoveActive)) return;
            const config = getRollToCursorConfig(prop);
            const dx = targetWorld.x - prop.x;
            const dy = targetWorld.y - prop.y;
            const dist = Math.hypot(dx, dy);
            if (dist < config.stopRadius) {
                if (groundMoveActive) {
                    groundMoveActive = false;
                    targetWorld = null;
                    releaseRollMoveTarget(prop);
                    return;
                }
                decelerateRoll(prop, dt, config);
                return;
            }
            steerRollToward(prop, dx / dist, dy / dist, dt, config);
        },
        getPathOverlay(prop) {
            if (!targetWorld || (!unitDragActive && !groundMoveActive)) return null;
            return { mode: "direct", fromX: prop.x, fromY: prop.y, targetX: targetWorld.x, targetY: targetWorld.y };
        },
        reset() {
            clearTarget();
        },
    };
}
