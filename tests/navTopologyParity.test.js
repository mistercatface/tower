import { bakeNavTopologyLocal, navCanStep } from "../Libraries/Navigation/navigation.js";
import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import {  BeltPacked  } from "../Libraries/Spatial/spatial.js";
import {  isRailWallEdge  } from "../Libraries/Spatial/spatial.js";
import { stampRailWallsQuiet, RailWallBatch } from "../Libraries/Spatial/spatial.js";
import { createRailStampTestState } from "./harness/stateFactories.js";


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
        const straightEast = BeltPacked.defaultForSpawn("floor_belt");
        grid.writeFloorCell(grid.idx(4, 4), straightEast);
        grid.writeFloorCell(grid.idx(5, 4), straightEast);
        grid.writeFloorCell(grid.idx(7, 7), BeltPacked.rotate(straightEast, 1));
        stampRailWallsQuiet(createRailStampTestState(grid), RailWallBatch.single(grid.idx(3, 5), 0));

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

        const idx = (c, r) => grid.idx(c, r);
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
        assert.ok(isRailWallEdge(grid.getCellEdge(grid.idx(3, 5), 0)) || grid.canStep(idx(3, 4), idx(3, 5), navigation.topology) === false);

        terminateWorkerNavigation(navigation);
    });
});
