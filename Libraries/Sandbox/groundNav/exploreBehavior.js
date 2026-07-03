import { physicsSettings } from "../../Motion/physicsDefaults.js";
import { navHasPath } from "../../Pathfinding/navSession.js";
import { REPLAN_PRIORITY_TARGET } from "../../Pathfinding/hpaReplanPolicy.js";
import { createHpaGroundNavSession } from "./hpaGroundNavSession.js";
import { buildHpaGroundNavPathSettings, driveGroundNav, groundNavArrivedAtTarget } from "./driveGroundNav.js";
import { buildSabPathOverlayFromProgress, buildSabAbstractPathOverlay } from "../../Pathfinding/hpaPathSlot.js";
import { getKineticRollConfig, snapMoveTargetToCellCenter, steerRollToward, clearGroundRollDrive } from "../kineticRollActuator.js";
import { isEntityOnFloorBelt } from "../../Spatial/grid/FloorCell.js";
import { EXPLORE_BEHAVIOR_ID } from "../sandboxCapabilities.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { createSeededRng } from "../../Math/SeededRng.js";
import { pickNavWalkableCell } from "../../Procedural/Mazes/walkableCells.js";
import { isGlobalCellInMapGenBounds, getMapGenBoundsStampExtent } from "../mapGenBounds.js";
import { isNavWalkableCell } from "../../Spatial/grid/navWalkableCell.js";
/** @param {object} state @returns {import("../sandboxCapabilities.js").SandboxBehavior} */
export function createExploreBehavior(state) {
    const propRuns = new Map();
    const getRun = (prop) => {
        let run = propRuns.get(prop.id);
        if (!run) {
            run = {
                targetWorld: null,
                targetCellCol: null,
                targetCellRow: null,
                wasOnBelt: false,
                beltHandoffCooldown: { frames: 0 },
                hpaNav: createHpaGroundNavSession(),
                rng: createSeededRng(prop.id),
            };
            propRuns.set(prop.id, run);
        }
        return run;
    };
    const clearRunTarget = (run, state) => {
        run.targetWorld = null;
        run.targetCellCol = null;
        run.targetCellRow = null;
        run.wasOnBelt = false;
        run.beltHandoffCooldown.frames = 0;
        run.hpaNav.reset(state);
    };
    const applyMoveTarget = (run, world, forceReset = false) => {
        const snapped = snapMoveTargetToCellCenter(state.obstacleGrid, world);
        const cellChanged = snapped.col !== run.targetCellCol || snapped.row !== run.targetCellRow;
        run.targetWorld = snapped.world;
        run.targetCellCol = snapped.col;
        run.targetCellRow = snapped.row;
        if (forceReset || cellChanged) run.hpaNav.markTargetChanged();
    };
    const getActiveBoundsConfigForProp = (prop) => {
        const grid = state.obstacleGrid;
        const col = grid.worldCol(prop.x);
        const row = grid.worldRow(prop.y);
        const cellSize = grid.cellSize;
        const x = grid.gridCenterX(col);
        const y = grid.gridCenterY(row);
        const globalCol = Math.round(x / cellSize);
        const globalRow = Math.round(y / cellSize);
        if (state.editor.railMazeConfig && isGlobalCellInMapGenBounds(state.editor.railMazeConfig, globalCol, globalRow)) return state.editor.railMazeConfig;
        if (state.editor.railConfig && isGlobalCellInMapGenBounds(state.editor.railConfig, globalCol, globalRow)) return state.editor.railConfig;
        return state.editor.cavernConfig;
    };
    const pickNewTarget = (prop, run) => {
        const grid = state.obstacleGrid;
        const boundsConfig = getActiveBoundsConfigForProp(prop);
        // Attempt to find a nav-walkable cell inside the active bounds config
        let cell = pickNavWalkableCell(state, run.rng, boundsConfig);
        if (!cell) {
            // Fallback: search within active bounds config extent for cells that are nav-walkable
            const { originCol, originRow, cols, rows } = getMapGenBoundsStampExtent(boundsConfig);
            const gridCols = grid.cols;
            const gridRows = grid.rows;
            const cellSize = grid.cellSize;
            const navTopology = state.nav.topology;
            const candidates = [];
            for (let lr = 0; lr < rows; lr++)
                for (let lc = 0; lc < cols; lc++) {
                    const gc = originCol + lc;
                    const gr = originRow + lr;
                    if (isGlobalCellInMapGenBounds(boundsConfig, gc, gr)) {
                        const col = grid.worldCol(gc * cellSize);
                        const row = grid.worldRow(gr * cellSize);
                        if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
                            const idx = col + row * gridCols;
                            if (!grid.isBlockedIdx(idx) && isNavWalkableCell(grid, navTopology, idx)) candidates.push({ col, row });
                        }
                    }
                }
            if (candidates.length > 0) cell = candidates[Math.floor(run.rng() * candidates.length)];
        }
        if (cell) {
            const worldPos = grid.gridToWorld(cell.col, cell.row);
            applyMoveTarget(run, worldPos, true);
        } else {
            // No free cells anywhere, stop driving
            clearGroundRollDrive(prop);
            clearRunTarget(run, state);
        }
    };
    /** @param {number} dtMs */
    const tickProp = (prop, run, dtMs) => {
        const grid = state.obstacleGrid;
        const config = getKineticRollConfig(prop, { stopRadius: physicsSettings.groundNavHpa.stopRadius });
        let needsNewTarget = !run.targetWorld;
        if (!needsNewTarget)
            if (groundNavArrivedAtTarget(prop, run.targetWorld, run.targetCellCol, run.targetCellRow, grid, config.stopRadius))
                // Check if we arrived
                needsNewTarget = true;
        if (!needsNewTarget) {
            // Check if stuck
            const stuckThreshold = state.nav.settings.stuckReplanFrames * 3;
            if (run.hpaNav.navState.stuckFrames > stuckThreshold) needsNewTarget = true;
        }
        if (!needsNewTarget)
            if (!run.hpaNav.isRoutePending() && !navHasPath(run.hpaNav.navState))
                // Check if pathing failed
                needsNewTarget = true;
        if (needsNewTarget) pickNewTarget(prop, run);
        if (!run.targetWorld) return;
        const { vx, vy, steering, beltWasOnBelt } = driveGroundNav({
            prop,
            targetWorld: run.targetWorld,
            targetCellCol: run.targetCellCol,
            targetCellRow: run.targetCellRow,
            nav: run.hpaNav,
            beltWasOnBelt: run.wasOnBelt,
            beltHandoffCooldown: run.beltHandoffCooldown,
            state,
            dtMs: dtMs,
            pathSettings: buildHpaGroundNavPathSettings(state, prop, config.stopRadius),
        });
        run.wasOnBelt = beltWasOnBelt;
        if (!steering) {
            if (beltWasOnBelt) clearGroundRollDrive(prop);
            return;
        }
        if (vx === 0 && vy === 0) return;
        steerRollToward(prop, vx, vy, config);
    };
    return {
        id: EXPLORE_BEHAVIOR_ID,
        supports(_prop, asset) {
            return asset?.sandbox?.behaviors?.includes(EXPLORE_BEHAVIOR_ID) ?? false;
        },
        onPointerDown: () => false,
        onPointerMove() {},
        onPointerUp() {},
        setMoveTarget(prop, world) {
            const run = getRun(prop);
            applyMoveTarget(run, world, true);
        },
        updateMoveTarget(prop, world) {
            const run = getRun(prop);
            if (!run.targetWorld) return;
            applyMoveTarget(run, world);
        },
        hasMoveTarget(prop) {
            return getRun(prop).targetWorld != null;
        },
        getTargetCell(prop) {
            const run = getRun(prop);
            if (!run.targetWorld) return null;
            return { col: run.targetCellCol, row: run.targetCellRow };
        },
        needsNavRetry(prop) {
            const run = getRun(prop);
            if (!run.targetWorld) return true;
            if (run.hpaNav.isRoutePending()) return false;
            return !navHasPath(run.hpaNav.navState);
        },
        replanMoveTarget(prop, state) {
            const run = getRun(prop);
            if (!run.targetWorld) return;
            run.hpaNav.replan(prop, run.targetWorld.x, run.targetWorld.y, state, REPLAN_PRIORITY_TARGET);
        },
        getLocomotionStatus(prop) {
            const run = getRun(prop);
            const nav = run.hpaNav.navState;
            return { hasRoute: navHasPath(nav), replanPending: run.hpaNav.isRoutePending(), stuckFrames: nav.stuckFrames, pathLen: nav.pathLen };
        },
        clearMoveTarget(prop) {
            clearGroundRollDrive(prop);
            clearRunTarget(getRun(prop), state);
        },
        tickWorld(dtMs) {
            const worldProps = state.worldProps;
            const entityMeta = getSandboxEntityMeta(state);
            for (let i = 0; i < worldProps.length; i++) {
                const prop = worldProps[i];
                if (prop.isDead) continue;
                const activeId = entityMeta.getActiveBehaviorId(prop.id);
                if (activeId === EXPLORE_BEHAVIOR_ID) tickProp(prop, getRun(prop), dtMs);
            }
        },
        getPathOverlay(prop) {
            const run = propRuns.get(prop.id);
            if (!run?.targetWorld) return null;
            const grid = state.obstacleGrid;
            if (isEntityOnFloorBelt(grid, prop.x, prop.y))
                return {
                    mode: "direct",
                    pathNodes: [
                        { x: prop.x, y: prop.y },
                        { x: run.targetWorld.x, y: run.targetWorld.y },
                    ],
                    targetX: run.targetWorld.x,
                    targetY: run.targetWorld.y,
                };
            const nav = run.hpaNav.navState;
            const progressIdx = nav.pathProgressIdx;
            const trace =
                nav.pathLen > 0 && nav.pathSlot >= 0
                    ? buildSabPathOverlayFromProgress(prop.x, prop.y, state.nav.worker, nav.pathSlot, nav.pathLen, progressIdx, state.obstacleGrid)
                    : { pathNodes: [] };
            const abstract = nav.pathLen > 0 && nav.pathSlot >= 0 ? buildSabAbstractPathOverlay(state.nav.worker, nav.pathSlot, nav.pathLen) : null;
            return { mode: "hpa", pathNodes: trace.pathNodes, targetX: run.targetWorld.x, targetY: run.targetWorld.y, abstractPath: abstract?.abstractPath, pathPlanner: abstract?.pathPlanner };
        },
        reset() {
            propRuns.forEach((run) => run.hpaNav.reset(state));
            propRuns.clear();
        },
    };
}
