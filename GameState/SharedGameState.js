import { gridSettings } from "../Config/Config.js";
import { getGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { HierarchicalNavigator } from "../Libraries/Pathfinding/HierarchicalNavigator.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { WallSpatialIndex } from "../Libraries/Spatial/indexes/WallSpatialIndex.js";
import { Scheduler } from "../Libraries/Scheduler/Scheduler.js";
import { WorldSurfaceSystem } from "../Render/game/WorldSurfaceSystem.js";
import { WallCollisionResolver } from "../Libraries/Motion/WallCollisionResolver.js";
/** Base state for engine loop, world bake, and sim render. */
export class SharedGameState {
    constructor() {
        this.scheduler = new Scheduler();
        this.phase = "simulation";
        this.obstacleGrid = new WorldObstacleGrid(gridSettings.cellSize);
        this.hierarchicalNavigator = new HierarchicalNavigator(gridSettings.cellSize, gridSettings.maxCellsPerChunk, gridSettings.minCellsPerChunk, this.obstacleGrid, { damagePadding: 12 });
        this.wallSpatialIndex = new WallSpatialIndex(100);
        this.worldSurfaces = new WorldSurfaceSystem(getGameWorldSurfaceSettings());
        /** @type {import("../Libraries/Viewport/Viewport.js").Viewport | null} */
        this.viewport = null;
        this.lastTime = 0;
        this.gameTime = 0;
        this.selectedSpeed = 1.0;
        this.isPaused = false;
        this.debugMode = false;
        this.radioSeenThisRun = {};
        this.walls = [];
        this.pickups = [];
        this.wallResolver = new WallCollisionResolver();
    }
}
