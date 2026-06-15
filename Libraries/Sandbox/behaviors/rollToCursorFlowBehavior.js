import { agentPose } from "../../Agent/index.js";
import { computeFlowFieldSteering } from "../../Pathfinding/flowSteering.js";
import { resolveFloorBeltSteerTarget } from "../../Spatial/grid/FloorCell.js";
import { getRollToCursorConfig, releaseRollMoveTarget, ROLL_TO_CURSOR_FLOW_RECENTER_THRESHOLD, snapRollMoveTargetToCellCenter, steerRollToward } from "../rollToCursorMotion.js";
export const ROLL_TO_CURSOR_FLOW_BEHAVIOR_ID = "rollToCursorFlow";
/** @param {object} state @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createRollToCursorFlowBehavior(state) {
    let targetWorld = null;
    let dragging = false;
    let lastNavGeneration = -1;
    const clearTarget = () => {
        targetWorld = null;
        dragging = false;
        lastNavGeneration = -1;
    };
    const releaseMoveTarget = (prop) => {
        clearTarget();
        releaseRollMoveTarget(prop);
    };
    const applyMoveTarget = (world) => {
        const snapped = snapRollMoveTargetToCellCenter(state.obstacleGrid, world);
        targetWorld = snapped.world;
    };
    const resolveSteerTarget = (prop) => resolveFloorBeltSteerTarget(state.obstacleGrid, targetWorld.x, targetWorld.y, prop.x, prop.y);
    const syncFlowWindow = (prop, steerTarget) => {
        state.flowFieldGrid.ensureRollTargetWindow(prop.x, prop.y, steerTarget.x, steerTarget.y, ROLL_TO_CURSOR_FLOW_RECENTER_THRESHOLD);
    };
    return {
        id: ROLL_TO_CURSOR_FLOW_BEHAVIOR_ID,
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
        setGroundMoveTarget(prop, world) {
            dragging = false;
            applyMoveTarget(world);
            if (!targetWorld) return;
            syncFlowWindow(prop, resolveSteerTarget(prop));
        },
        updateGroundMoveTarget(prop, world) {
            if (!targetWorld) return;
            applyMoveTarget(world);
            syncFlowWindow(prop, resolveSteerTarget(prop));
        },
        tick(prop, dt) {
            if (!targetWorld) return;
            const config = getRollToCursorConfig(prop, { stopRadius: 8 });
            const steerTarget = resolveSteerTarget(prop);
            const flowFieldGrid = state.flowFieldGrid;
            const navGeneration = state.navigation.obstacleGeneration;
            if (prop._navPathStale || navGeneration !== lastNavGeneration) {
                prop._navPathStale = false;
                lastNavGeneration = navGeneration;
                flowFieldGrid.refresh();
            }
            syncFlowWindow(prop, steerTarget);
            const distToTarget = Math.hypot(steerTarget.x - prop.x, steerTarget.y - prop.y);
            if (distToTarget <= config.stopRadius) {
                releaseMoveTarget(prop);
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
