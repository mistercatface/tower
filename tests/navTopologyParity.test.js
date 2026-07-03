import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { FLOOR_CELL_KIND } from "../Libraries/Spatial/grid/FloorCell.js";
import { isRailWallEdge } from '../Libraries/Spatial/grid/CellEdgeStore.js';
import { stampRailWallsQuiet } from "../Libraries/Sandbox/gridWallEdit.js";
import { bakeNavTopologyLocal } from "../Libraries/Pathfinding/bakeNavTopology.js";
import { navCanStep } from "../Libraries/Pathfinding/navTopologySab.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";

function sampleStepPairs(cols, rows) {
    /** @type {{ fromIdx: number, toIdx: number }[]} */
    const pairs = [];
    for (let row = 1; row < rows - 1; row++)
        for (let col = 1; col < cols - 1; col++) {
            const idx = col + row * cols;
            pairs.push({ fromIdx: idx, toIdx: (col + 1) + row * cols });
            pairs.push({ fromIdx: idx, toIdx: col + (row + 1) * cols });
            pairs.push({ fromIdx: idx, toIdx: (col + 1) + (row + 1) * cols });
        }
    return pairs;
}

describe("nav topology parity", () => {
    it("local bake matches worker canStep for belts and rail walls", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 12 * 16, 12 * 16);
        grid.writeFloorCell(4 + 4 * grid.cols, FLOOR_CELL_KIND.Belt, 0);
        grid.writeFloorCell(5 + 4 * grid.cols, FLOOR_CELL_KIND.Belt, 0);
        grid.writeFloorCell(7 + 7 * grid.cols, FLOOR_CELL_KIND.Belt, 1);
        stampRailWallsQuiet({ obstacleGrid: grid, worldSurfaces: { settings: { maxWallHeightLevel: 4 } } }, [{ col: 3, row: 5, side: 0, heightLevel: 1, thicknessLevel: 1 }]);

        const navigation = await createWorkerNavigation(grid);
        await navigation.awaitWorkerNavReady();

        const workerFrame = navigation.topology.frame;
        const workerTopology = navigation.topology.topology;
        assert.ok(workerFrame && workerTopology);

        const local = bakeNavTopologyLocal(grid);

        const pairs = sampleStepPairs(grid.cols, grid.rows);
        for (let i = 0; i < pairs.length; i++) {
            const { fromIdx, toIdx } = pairs[i];
            const workerStep = navCanStep(workerFrame, workerTopology, fromIdx, toIdx);
            const localStep = navCanStep(local.frame, local.topology, fromIdx, toIdx);
            assert.equal(localStep, workerStep, `canStep parity ${fromIdx}→${toIdx}`);
        }

        const idx = (c, r) => c + r * grid.cols;
        assert.equal(navCanStep(local.frame, local.topology, idx(4, 4), idx(5, 4)), true);
        assert.equal(navCanStep(local.frame, local.topology, idx(5, 4), idx(4, 4)), false);
        assert.equal(navCanStep(local.frame, local.topology, idx(4, 4), idx(4, 5)), false);
        assert.equal(navCanStep(local.frame, local.topology, idx(7, 6), idx(7, 7)), true);
        assert.equal(navCanStep(local.frame, local.topology, idx(6, 7), idx(7, 7)), true);
        assert.equal(navCanStep(local.frame, local.topology, idx(7, 7), idx(7, 8)), true);
        assert.equal(navCanStep(local.frame, local.topology, idx(7, 7), idx(8, 7)), false);
        assert.equal(navCanStep(local.frame, local.topology, idx(7, 7), idx(7, 6)), false);
        assert.equal(navCanStep(workerFrame, workerTopology, idx(7, 6), idx(7, 7)), true);
        assert.equal(navCanStep(workerFrame, workerTopology, idx(6, 7), idx(7, 7)), true);
        assert.equal(navCanStep(workerFrame, workerTopology, idx(7, 7), idx(7, 8)), true);
        assert.equal(navCanStep(workerFrame, workerTopology, idx(7, 7), idx(8, 7)), false);
        assert.equal(navCanStep(workerFrame, workerTopology, idx(7, 7), idx(7, 6)), false);
        assert.ok(isRailWallEdge(grid.edgeStore.getIdx(5 * grid.cols + 3, 0)) || grid.canStep(idx(3, 4), idx(3, 5), navigation.topology) === false);

        terminateWorkerNavigation(navigation);
    });
});
