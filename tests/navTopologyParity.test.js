import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { floorBeltFacingFromIndex, FLOOR_CELL_KIND } from "../Libraries/Spatial/grid/FloorCell.js";
import { isRailWallEdge } from "../Libraries/Spatial/grid/CellEdge.js";
import { stampRailWallsQuiet } from "../Libraries/Sandbox/gridWallEdit.js";
import { bakeNavTopologyLocal } from "../Libraries/Pathfinding/bakeNavTopology.js";
import { navCanStep } from "../Libraries/Pathfinding/navTopologySab.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";

function sampleStepPairs(cols, rows) {
    /** @type {{ fromCol: number, fromRow: number, toCol: number, toRow: number }[]} */
    const pairs = [];
    for (let row = 1; row < rows - 1; row++)
        for (let col = 1; col < cols - 1; col++) {
            pairs.push({ fromCol: col, fromRow: row, toCol: col + 1, toRow: row });
            pairs.push({ fromCol: col, fromRow: row, toCol: col, toRow: row + 1 });
            pairs.push({ fromCol: col, fromRow: row, toCol: col + 1, toRow: row + 1 });
        }
    return pairs;
}

describe("nav topology parity", () => {
    it("local bake matches worker canStep for belts and rail walls", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 12 * 16, 12 * 16);
        grid.writeFloorCell(4, 4, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));
        grid.writeFloorCell(5, 4, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));
        stampRailWallsQuiet({ obstacleGrid: grid, worldSurfaces: { settings: { maxWallHeightLevel: 4 } } }, [{ col: 3, row: 5, side: 0, heightLevel: 1, thicknessLevel: 1 }]);

        const navigation = await createWorkerNavigation(grid);
        await navigation.awaitWorkerNavReady();

        const workerFrame = navigation.topology.frame;
        const workerTopology = navigation.topology.topology;
        assert.ok(workerFrame && workerTopology);

        const local = bakeNavTopologyLocal(grid);

        const pairs = sampleStepPairs(grid.cols, grid.rows);
        for (let i = 0; i < pairs.length; i++) {
            const { fromCol, fromRow, toCol, toRow } = pairs[i];
            const workerStep = navCanStep(workerFrame, workerTopology, fromCol, fromRow, toCol, toRow);
            const localStep = navCanStep(local.frame, local.topology, fromCol, fromRow, toCol, toRow);
            assert.equal(localStep, workerStep, `canStep parity (${fromCol},${fromRow})→(${toCol},${toRow})`);
        }

        assert.equal(navCanStep(local.frame, local.topology, 4, 4, 5, 4), true);
        assert.equal(navCanStep(local.frame, local.topology, 5, 4, 4, 4), false);
        assert.equal(navCanStep(local.frame, local.topology, 4, 4, 4, 5), false);
        assert.ok(isRailWallEdge(grid.edgeStore.get(3, 5, 0, grid.cols)) || grid.canStep(3, 4, 3, 5, navigation.gridNavContext) === false);

        terminateWorkerNavigation(navigation);
    });
});
