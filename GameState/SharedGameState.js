import { gridSettings } from "../Config/Config.js";
import { FLOW_FIELD_WORKER_URL, HPA_WORKER_URL } from "../Render/WorldSurfaceBootstrap.js";
import { getGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { FlowFieldGrid } from "../Libraries/Pathfinding/FlowFieldGrid.js";
import { HpaPathWorker } from "../Libraries/Pathfinding/HpaPathWorker.js";
import { HpaPathSession } from "../Libraries/Pathfinding/HpaPathSession.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { Scheduler } from "../Libraries/Scheduler/Scheduler.js";
import { WorldSurfaceSystem } from "../Render/game/WorldSurfaceSystem.js";
import { WallCollisionResolver } from "../Libraries/Motion/WallCollisionResolver.js";
import { NavigationService } from "../Systems/Navigation/NavigationService.js";
import { EntityRegistry } from "./EntityRegistry.js";
const navigationSettings = { arrivalDistance: 2, recenterThreshold: 400, stuckReplanFrames: 20, stuckMoveThreshold: 1.5, targetNodeLookahead: 10, pathWaypointArrival: 10 };
export class SharedGameState {
    constructor() {
        this.scheduler = new Scheduler();
        this.phase = "simulation";
        this.obstacleGrid = new WorldObstacleGrid(gridSettings.cellSize);
        this.hpaPathWorker = new HpaPathWorker(HPA_WORKER_URL, this.obstacleGrid);
        this.hpaPathSession = new HpaPathSession(this.hpaPathWorker);
        this.flowFieldGrid = new FlowFieldGrid(gridSettings.cellSize, gridSettings.width, gridSettings.height, this.obstacleGrid, FLOW_FIELD_WORKER_URL, this.hpaPathWorker);
        this.navigation = new NavigationService(this.flowFieldGrid, this.obstacleGrid, navigationSettings, this.hpaPathWorker);
        this.worldSurfaces = new WorldSurfaceSystem(getGameWorldSurfaceSettings());
        this.viewport = null;
        this.lastTime = 0;
        this.gameTime = 0;
        this.selectedSpeed = 1.0;
        this.isPaused = false;
        this.debugMode = false;
        this.radioSeenThisRun = {};
        this.worldProps = [];
        this.entityRegistry = new EntityRegistry();
        this.wallResolver = new WallCollisionResolver();
        this.obstacleGrid.rebuildFixed(0, 0, gridSettings.width, gridSettings.height);
        void this.navigation.onObstaclesChanged(null);
    }
}
