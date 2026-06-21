import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { floorBeltFacingFromIndex, FLOOR_CELL_KIND } from "../Libraries/Spatial/grid/FloorCell.js";
import { cellTargetHasArrivedAtDestCell, createCellTargetHpaNav, shouldReleaseCellTargetHpaNav } from "../Libraries/Sandbox/groundNav/cellTargetHpaNav.js";
import { steerRollToward, getKineticRollConfig } from "../Libraries/Sandbox/kineticRollActuator.js";
import { HpaPathSession } from "../Libraries/Pathfinding/HpaPathSession.js";
import { FRAME_MS } from "./frameMs.js";

describe("cellTargetHasArrivedAtDestCell", () => {
    it("requires standing on a belt destination cell, not the entry mouth", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        grid.writeFloorCell(5, 5, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));
        assert.equal(cellTargetHasArrivedAtDestCell(grid, 4, 5, 5, 5), false);
        assert.equal(cellTargetHasArrivedAtDestCell(grid, 5, 5, 5, 5), true);
    });

    it("still allows Chebyshev 1 arrival for normal floor cells", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        assert.equal(cellTargetHasArrivedAtDestCell(grid, 4, 5, 5, 5), true);
        assert.equal(cellTargetHasArrivedAtDestCell(grid, 6, 7, 5, 5), false);
    });
});

function createCellTargetNavState(prop) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 32 * 16, 32 * 16);
    const mockWorker = {
        getPathSlot: () => -1,
        releaseOwnedPathSlot: () => {},
        releaseSlot: () => {},
        requestPath: async () => ({ result: { pathLen: 0, pathSlot: -1, pathProgressIdx: 0 } }),
    };
    const session = new HpaPathSession(mockWorker);
    return {
        obstacleGrid: grid,
        nav: { settings: { stuckReplanFrames: 30, recenterThreshold: 64 }, topologyKey: () => "", syncedTopologyKey: () => "", graphSyncGeneration: 0, commitEdit: async () => {}, worker: mockWorker, session, topology: null },
        viewport: { circleInBounds: () => true },
        entityRegistry: { getLive: (id) => (id === prop.id ? prop : null) },
    };
}

describe("cellTargetHpaNav arrival", () => {
    it("releases roll drive on arrival at destination cell", () => {
        const prop = { id: 1, x: 96, y: 80, radius: 2, vx: 5, vy: 0, strategy: { rolls: true, groundNav: {} } };
        const state = createCellTargetNavState(prop);
        const headNav = createCellTargetHpaNav(state);
        headNav.setDestination(state.obstacleGrid, 6, 5);
        const dest = state.obstacleGrid.gridToWorld(6, 5);
        prop.x = dest.x;
        prop.y = dest.y;
        steerRollToward(prop, 1, 0, getKineticRollConfig(prop));
        assert.ok(shouldReleaseCellTargetHpaNav(prop, state.obstacleGrid, 6, 5, dest, 8));
        headNav.tick(prop, FRAME_MS);
        assert.equal(headNav.getDestination(), null);
        assert.equal(prop._groundRollDrive, undefined);
        assert.equal(prop.vx, 5);
    });

    it("keeps driving locked seek targets after path arrival but before collision", () => {
        const prop = { id: 1, x: 96, y: 80, radius: 2, vx: 0, vy: 0, strategy: { rolls: true, groundNav: {} } };
        const state = createCellTargetNavState(prop);
        const headNav = createCellTargetHpaNav(state);
        const target = state.obstacleGrid.gridToWorld(7, 5);
        prop.x = target.x - 10;
        prop.y = target.y;
        headNav.setDestination(state.obstacleGrid, 7, 5, { world: target, exactArrival: true, arrivalRadius: 20, lockOnTarget: true });

        headNav.tick(prop, FRAME_MS);

        assert.ok(headNav.getDestination(), "locked target should remain active until the caller consumes it");
        assert.ok(prop._groundRollDrive, "locked target should keep applying drive toward the target");
        assert.ok(prop._groundRollDrive.dirX > 0);
    });
});
