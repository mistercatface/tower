import { decelerateRoll, getKineticRollConfig, steerRollToward } from "../kineticRollActuator.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID } from "./groundNavIds.js";
export function createDirectGroundNavBehavior(state) {
    const propRuns = new Map();
    const getRun = (prop) => {
        let run = propRuns.get(prop.id);
        if (!run) {
            run = { targetWorld: null, unitDragActive: false, moveTargetActive: false };
            propRuns.set(prop.id, run);
        }
        return run;
    };
    const clearRunTarget = (run) => {
        run.targetWorld = null;
        run.unitDragActive = false;
        run.moveTargetActive = false;
    };
    const tickProp = (prop, run, dt) => {
        if (!run.targetWorld || (!run.unitDragActive && !run.moveTargetActive)) return;
        const config = getKineticRollConfig(prop);
        const dx = run.targetWorld.x - prop.x;
        const dy = run.targetWorld.y - prop.y;
        const dist = Math.hypot(dx, dy);
        if (dist < config.stopRadius) {
            if (run.moveTargetActive) {
                clearRunTarget(run);
                return;
            }
            decelerateRoll(prop, config);
            return;
        }
        steerRollToward(prop, dx / dist, dy / dist, config);
    };
    return {
        id: DIRECT_GROUND_NAV_BEHAVIOR_ID,
        onPointerDown(prop, world) {
            const run = getRun(prop);
            run.unitDragActive = true;
            run.moveTargetActive = false;
            run.targetWorld = { x: world.x, y: world.y };
            return true;
        },
        onPointerMove(prop, world) {
            const run = getRun(prop);
            if (!run.unitDragActive) return;
            run.targetWorld = { x: world.x, y: world.y };
        },
        onPointerUp(prop) {
            const run = getRun(prop);
            run.unitDragActive = false;
            if (!run.moveTargetActive) run.targetWorld = null;
        },
        setMoveTarget(prop, world) {
            const run = getRun(prop);
            run.unitDragActive = false;
            run.moveTargetActive = true;
            run.targetWorld = { x: world.x, y: world.y };
        },
        updateMoveTarget(prop, world) {
            const run = getRun(prop);
            if (!run.moveTargetActive || !run.targetWorld) return;
            run.targetWorld = { x: world.x, y: world.y };
        },
        hasMoveTarget(prop) {
            const run = getRun(prop);
            return run.moveTargetActive && run.targetWorld != null;
        },
        clearMoveTarget(prop) {
            clearRunTarget(getRun(prop));
        },
        tick(prop, dt) {
            tickProp(prop, getRun(prop), dt);
        },
        tickWorld(dt) {
            propRuns.forEach((run, propId) => {
                if (!run.targetWorld || (!run.unitDragActive && !run.moveTargetActive)) return;
                const prop = state.entityRegistry.getLive(propId);
                if (!prop) {
                    propRuns.delete(propId);
                    return;
                }
                tickProp(prop, run, dt);
            });
        },
        getPathOverlay(prop) {
            const run = propRuns.get(prop.id);
            if (!run?.targetWorld || (!run.unitDragActive && !run.moveTargetActive)) return null;
            return {
                mode: "direct",
                pathNodes: [
                    { x: prop.x, y: prop.y },
                    { x: run.targetWorld.x, y: run.targetWorld.y },
                ],
            };
        },
        reset() {
            propRuns.clear();
        },
    };
}
