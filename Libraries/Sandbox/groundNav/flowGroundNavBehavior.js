import { physicsSettings } from "../../Motion/physicsDefaults.js";
import { sampleFlowDirectionOnGrid } from "../../Pathfinding/sampleFlowDirection.js";
import { snapNavGoalWorld } from "../../Navigation/snapNavGoal.js";
import { driveFlowGroundNav } from "./driveFlowGroundNav.js";
import { getKineticRollConfig, snapMoveTargetToCellCenter, steerRollToward, clearGroundRollDrive } from "../kineticRollActuator.js";
import { FLOW_GROUND_NAV_BEHAVIOR_ID } from "./groundNavIds.js";
export function createFlowGroundNavBehavior(state) {
    const propRuns = new Map();
    const getRun = (prop) => {
        let run = propRuns.get(prop.id);
        if (!run) {
            run = { targetWorld: null, dragging: false, lastTopologyKey: "" };
            propRuns.set(prop.id, run);
        }
        return run;
    };
    const clearRunTarget = (run) => {
        run.targetWorld = null;
        run.dragging = false;
        run.lastTopologyKey = "";
    };
    const applyMoveTarget = (run, world) => {
        const snapped = snapMoveTargetToCellCenter(state.obstacleGrid, world);
        run.targetWorld = snapped.world;
    };
    const resolveSteerTarget = (run, prop) => snapNavGoalWorld(state.obstacleGrid, prop.x, prop.y, run.targetWorld.x, run.targetWorld.y);
    const syncFlowWindow = (prop, steerTarget) => {
        state.flowFieldGrid.ensureRollTargetWindow(prop.x, prop.y, steerTarget.x, steerTarget.y, state.nav.settings.recenterThreshold);
    };
    const tickProp = (prop, run, dt) => {
        if (!run.targetWorld) return;
        const config = getKineticRollConfig(prop, { stopRadius: physicsSettings.groundNavHpa.stopRadius });
        const steerTarget = resolveSteerTarget(run, prop);
        const flowFieldGrid = state.flowFieldGrid;
        const topologyKey = state.nav.topologyKey();
        if (topologyKey !== run.lastTopologyKey) {
            run.lastTopologyKey = topologyKey;
            flowFieldGrid.refresh();
        }
        syncFlowWindow(prop, steerTarget);
        const distToTarget = Math.hypot(steerTarget.x - prop.x, steerTarget.y - prop.y);
        if (distToTarget <= config.stopRadius) {
            clearGroundRollDrive(prop);
            clearRunTarget(run);
            return;
        }
        const { vx, vy, steering } = driveFlowGroundNav({ prop, targetWorld: steerTarget, flowFieldGrid });
        if (!steering) return;
        steerRollToward(prop, vx, vy, config);
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
            const flowField = state.flowFieldGrid.getReadyFlowField(steerTarget.x, steerTarget.y);
            let dirX = null;
            let dirY = null;
            if (flowField) {
                const dir = sampleFlowDirectionOnGrid(prop.x, prop.y, flowField, state.flowFieldGrid);
                if (dir) {
                    dirX = dir.x;
                    dirY = dir.y;
                }
            }
            return { mode: "flow", propX: prop.x, propY: prop.y, propRadius: prop.radius ?? 8, dirX, dirY, targetX: steerTarget.x, targetY: steerTarget.y };
        },
        reset() {
            propRuns.clear();
        },
    };
}
