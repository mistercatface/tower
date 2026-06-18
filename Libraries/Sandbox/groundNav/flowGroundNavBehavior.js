import { agentPose } from "../../Agent/index.js";
import { computeFlowFieldSteering } from "../../Pathfinding/flowSteering.js";
import { resolveFloorBeltSteerTarget } from "../../Spatial/grid/FloorCell.js";
import { getKineticRollConfig, snapMoveTargetToCellCenter, steerRollToward } from "../kineticRollActuator.js";
import { FLOW_GROUND_NAV_BEHAVIOR_ID } from "./groundNavIds.js";
export function createFlowGroundNavBehavior(state) {
    const propRuns = new Map();
    const getRun = (prop) => {
        let run = propRuns.get(prop.id);
        if (!run) {
            run = { targetWorld: null, dragging: false, lastNavGeneration: -1 };
            propRuns.set(prop.id, run);
        }
        return run;
    };
    const clearRunTarget = (run) => {
        run.targetWorld = null;
        run.dragging = false;
        run.lastNavGeneration = -1;
    };
    const applyMoveTarget = (run, world) => {
        const snapped = snapMoveTargetToCellCenter(state.obstacleGrid, world);
        run.targetWorld = snapped.world;
    };
    const resolveSteerTarget = (run, prop) => resolveFloorBeltSteerTarget(state.obstacleGrid, run.targetWorld.x, run.targetWorld.y, prop.x, prop.y);
    const syncFlowWindow = (prop, steerTarget) => {
        state.flowFieldGrid.ensureRollTargetWindow(prop.x, prop.y, steerTarget.x, steerTarget.y, state.navigation.settings.recenterThreshold);
    };
    const tickProp = (prop, run, dt) => {
        if (!run.targetWorld) return;
        const config = getKineticRollConfig(prop, { stopRadius: 8 });
        const steerTarget = resolveSteerTarget(run, prop);
        const flowFieldGrid = state.flowFieldGrid;
        const navGeneration = state.navigation.obstacleGeneration;
        if (navGeneration !== run.lastNavGeneration) {
            run.lastNavGeneration = navGeneration;
            flowFieldGrid.refresh();
        }
        syncFlowWindow(prop, steerTarget);
        const distToTarget = Math.hypot(steerTarget.x - prop.x, steerTarget.y - prop.y);
        if (distToTarget <= config.stopRadius) {
            clearRunTarget(run);
            return;
        }
        const steering = computeFlowFieldSteering(agentPose(prop), steerTarget.x, steerTarget.y, flowFieldGrid);
        if (!steering) return;
        steerRollToward(prop, steering.desiredX, steering.desiredY, dt, config);
    };
    return {
        id: FLOW_GROUND_NAV_BEHAVIOR_ID,
        onPointerDown(prop, world) {
            const run = getRun(prop);
            run.dragging = true;
            applyMoveTarget(run, world);
            syncFlowWindow(prop, resolveSteerTarget(run, prop));
            return true;
        },
        onPointerMove(prop, world) {
            const run = getRun(prop);
            if (!run.dragging || !run.targetWorld) return;
            applyMoveTarget(run, world);
            syncFlowWindow(prop, resolveSteerTarget(run, prop));
        },
        onPointerUp(prop) {
            getRun(prop).dragging = false;
        },
        setMoveTarget(prop, world) {
            const run = getRun(prop);
            run.dragging = false;
            applyMoveTarget(run, world);
            if (!run.targetWorld) return;
            syncFlowWindow(prop, resolveSteerTarget(run, prop));
        },
        updateMoveTarget(prop, world) {
            const run = getRun(prop);
            if (!run.targetWorld) return;
            applyMoveTarget(run, world);
            syncFlowWindow(prop, resolveSteerTarget(run, prop));
        },
        tick(prop, dt) {
            tickProp(prop, getRun(prop), dt);
        },
        tickWorld(dt) {
            propRuns.forEach((run, propId) => {
                if (!run.targetWorld) return;
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
            if (!run?.targetWorld) return null;
            const steerTarget = resolveSteerTarget(run, prop);
            return { mode: "flow", targetX: steerTarget.x, targetY: steerTarget.y, flowFieldGrid: state.flowFieldGrid };
        },
        reset() {
            propRuns.clear();
        },
    };
}
