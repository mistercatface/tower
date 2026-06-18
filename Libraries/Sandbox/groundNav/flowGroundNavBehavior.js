import { agentPose } from "../../Agent/index.js";
import { computeFlowFieldSteering } from "../../Pathfinding/flowSteering.js";
import { resolveFloorBeltSteerTarget } from "../../Spatial/grid/FloorCell.js";
import { getKineticRollConfig, snapMoveTargetToCellCenter, steerRollToward } from "../kineticRollActuator.js";
import { FLOW_GROUND_NAV_BEHAVIOR_ID } from "./groundNavIds.js";
export function createFlowGroundNavBehavior(state) {
    let targetWorld = null;
    let dragging = false;
    let lastNavGeneration = -1;
    const clearTarget = () => {
        targetWorld = null;
        dragging = false;
        lastNavGeneration = -1;
    };
    const releaseMoveTarget = () => {
        clearTarget();
    };
    const applyMoveTarget = (world) => {
        const snapped = snapMoveTargetToCellCenter(state.obstacleGrid, world);
        targetWorld = snapped.world;
    };
    const resolveSteerTarget = (prop) => resolveFloorBeltSteerTarget(state.obstacleGrid, targetWorld.x, targetWorld.y, prop.x, prop.y);
    const syncFlowWindow = (prop, steerTarget) => {
        state.flowFieldGrid.ensureRollTargetWindow(prop.x, prop.y, steerTarget.x, steerTarget.y, state.navigation.settings.recenterThreshold);
    };
    return {
        id: FLOW_GROUND_NAV_BEHAVIOR_ID,
        onPointerDown(prop, world) {
            dragging = true;
            applyMoveTarget(world);
            syncFlowWindow(prop, resolveSteerTarget(prop));
            return true;
        },
        onPointerMove(prop, world) {
            if (!dragging || !targetWorld) return;
            applyMoveTarget(world);
            syncFlowWindow(prop, resolveSteerTarget(prop));
        },
        onPointerUp() {
            dragging = false;
        },
        setMoveTarget(prop, world) {
            dragging = false;
            applyMoveTarget(world);
            if (!targetWorld) return;
            syncFlowWindow(prop, resolveSteerTarget(prop));
        },
        updateMoveTarget(prop, world) {
            if (!targetWorld) return;
            applyMoveTarget(world);
            syncFlowWindow(prop, resolveSteerTarget(prop));
        },
        tick(prop, dt) {
            if (!targetWorld) return;
            const config = getKineticRollConfig(prop, { stopRadius: 8 });
            const steerTarget = resolveSteerTarget(prop);
            const flowFieldGrid = state.flowFieldGrid;
            const navGeneration = state.navigation.obstacleGeneration;
            if (navGeneration !== lastNavGeneration) {
                lastNavGeneration = navGeneration;
                flowFieldGrid.refresh();
            }
            syncFlowWindow(prop, steerTarget);
            const distToTarget = Math.hypot(steerTarget.x - prop.x, steerTarget.y - prop.y);
            if (distToTarget <= config.stopRadius) {
                releaseMoveTarget();
                return;
            }
            const steering = computeFlowFieldSteering(agentPose(prop), steerTarget.x, steerTarget.y, flowFieldGrid);
            if (!steering) return;
            steerRollToward(prop, steering.desiredX, steering.desiredY, dt, config);
        },
        getPathOverlay(prop) {
            if (!targetWorld) return null;
            const steerTarget = resolveSteerTarget(prop);
            return { mode: "flow", targetX: steerTarget.x, targetY: steerTarget.y, flowFieldGrid: state.flowFieldGrid };
        },
        reset() {
            clearTarget();
        },
    };
}
