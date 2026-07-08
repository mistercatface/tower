import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { buildNavComponentMap } from "../Libraries/Navigation/navigation.js";
import { terminateWorkerNavigation, enableTestNavigationTracking, terminateAllWorkerNavigations } from "./WorkerNavigationFactory.js";
import { packedRegionGraphFromWorker, hasDirectedRegionPath } from "./harness/navGraphHarness.js";
import {
    mulberry32,
    createSnakeNavStressState,
    assertSnakeLaunchReady,
    boidOpenCellIdx,
    pickRandomReachableTargetWorld,
    requestSnakeGroundNavReplan,
} from "./harness/snakeNavStressHarness.js";

enableTestNavigationTracking();

after(async () => {
    await terminateAllWorkerNavigations();
});

describe("snake HPA region coherence", () => {
    it("seed 42 worker region graph connects same walkable component", async () => {
        const seed = 42;
        const { state, boid } = await createSnakeNavStressState(seed);
        assertSnakeLaunchReady(state);
        await state.nav.awaitWorkerNavReady();

        const grid = state.obstacleGrid;
        const topology = state.nav.topology.topology;
        const startIdx = boidOpenCellIdx(state, boid);
        const targetWorld = pickRandomReachableTargetWorld(state, startIdx, mulberry32(seed), boid);
        assert.ok(targetWorld != null, "expected a reachable click target");
        const targetIdx = targetWorld.idx;

        const cellToComponent = buildNavComponentMap(
            topology.blocked,
            topology.octileNeighbors,
            grid.cols,
            grid.rows,
            grid.activePortalPairs,
            grid.activePortalCount,
        );
        const startComp = cellToComponent[startIdx];
        const targetComp = cellToComponent[targetIdx];
        assert.equal(startComp, targetComp, `start/target must share component (start=${startIdx} target=${targetIdx})`);

        const packed = packedRegionGraphFromWorker(state.nav.worker);
        assert.ok(packed, "worker region graph must be ready");
        const startRegion = packed.cellToRegion[startIdx];
        const targetRegion = packed.cellToRegion[targetIdx];
        assert.ok(startRegion >= 0, `start region assigned (startIdx=${startIdx})`);
        assert.ok(targetRegion >= 0, `target region assigned (targetIdx=${targetIdx})`);
        assert.ok(
            hasDirectedRegionPath(packed, startRegion, targetRegion),
            `abstract region path missing for same component (startRegion=${startRegion} targetRegion=${targetRegion} startComp=${startComp})`,
        );

        const pathLen = await requestSnakeGroundNavReplan(state, boid, targetWorld);
        assert.ok(pathLen > 0, `HPA replan failed for coherent region graph (startIdx=${startIdx} targetIdx=${targetIdx})`);

        await terminateWorkerNavigation(state.nav);
    });
});
