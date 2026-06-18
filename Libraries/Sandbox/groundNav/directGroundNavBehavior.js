import { decelerateRoll, getKineticRollConfig, steerRollToward } from "../kineticRollActuator.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID } from "./groundNavIds.js";
export function createDirectGroundNavBehavior() {
    let targetWorld = null;
    let unitDragActive = false;
    let moveTargetActive = false;
    const clearTarget = () => {
        targetWorld = null;
        unitDragActive = false;
        moveTargetActive = false;
    };
    return {
        id: DIRECT_GROUND_NAV_BEHAVIOR_ID,
        onPointerDown(prop, world) {
            unitDragActive = true;
            moveTargetActive = false;
            targetWorld = { x: world.x, y: world.y };
            return true;
        },
        onPointerMove(prop, world) {
            if (!unitDragActive) return;
            targetWorld = { x: world.x, y: world.y };
        },
        onPointerUp() {
            unitDragActive = false;
            if (!moveTargetActive) targetWorld = null;
        },
        setMoveTarget(_prop, world) {
            unitDragActive = false;
            moveTargetActive = true;
            targetWorld = { x: world.x, y: world.y };
        },
        updateMoveTarget(_prop, world) {
            if (!moveTargetActive || !targetWorld) return;
            targetWorld = { x: world.x, y: world.y };
        },
        tick(prop, dt) {
            if (!targetWorld || (!unitDragActive && !moveTargetActive)) return;
            const config = getKineticRollConfig(prop);
            const dx = targetWorld.x - prop.x;
            const dy = targetWorld.y - prop.y;
            const dist = Math.hypot(dx, dy);
            if (dist < config.stopRadius) {
                if (moveTargetActive) {
                    moveTargetActive = false;
                    targetWorld = null;
                    return;
                }
                decelerateRoll(prop, dt, config);
                return;
            }
            steerRollToward(prop, dx / dist, dy / dist, dt, config);
        },
        getPathOverlay(prop) {
            if (!targetWorld || (!unitDragActive && !moveTargetActive)) return null;
            return {
                mode: "direct",
                pathNodes: [
                    { x: prop.x, y: prop.y },
                    { x: targetWorld.x, y: targetWorld.y },
                ],
            };
        },
        reset() {
            clearTarget();
        },
    };
}
