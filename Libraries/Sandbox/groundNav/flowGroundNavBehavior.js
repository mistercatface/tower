import { physicsSettings } from "../../Physics/physics.js";
import { sampleFlowDirectionInto } from "../../Pathfinding/sampleFlowDirection.js";
import { snapNavGoalWorldInto } from "../../Navigation/navGraph.js";
import { agentPose } from "../../Agent/index.js";
import { getKineticRollConfig, snapMoveTargetToCellCenter, steerRollToward, clearGroundRollDrive } from "../kineticRollActuator.js";
import { FLOW_GROUND_NAV_BEHAVIOR_ID } from "../sandboxCapabilities.js";
const FLOW_OVERLAY_DIR_SCRATCH = { x: 0, y: 0 };
const FLOW_DIR_SCRATCH = { x: 0, y: 0 };
const SCRATCH_STEER_TARGET = { x: 0, y: 0 };
function computeFlowFieldSteering(pose, targetX, targetY, flowFieldGrid) {
    const flowField = flowFieldGrid.getReadyFlowField(targetX, targetY);
    if (!flowField) return null;
    const dir = sampleFlowDirectionInto(FLOW_DIR_SCRATCH, pose.x, pose.y, flowField, flowFieldGrid.frame);
    if (!dir) return null;
    return { desiredX: dir.x, desiredY: dir.y };
}
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
    const resolveSteerTarget = (run, prop) => snapNavGoalWorldInto(SCRATCH_STEER_TARGET, state.obstacleGrid, prop.x, prop.y, run.targetWorld.x, run.targetWorld.y);
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
        const steering = computeFlowFieldSteering(agentPose(prop), steerTarget.x, steerTarget.y, flowFieldGrid);
        if (!steering) return;
        steerRollToward(prop, steering.desiredX, steering.desiredY, config);
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
                const dir = sampleFlowDirectionInto(FLOW_OVERLAY_DIR_SCRATCH, prop.x, prop.y, flowField, state.flowFieldGrid.frame);
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
