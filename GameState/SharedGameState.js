import { gridSettings, worldSpanPx } from "../Config/world.js";
import { FLOW_FIELD_WORKER_URL, HPA_WORKER_URL, gameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { FlowFieldGrid } from "../Libraries/Pathfinding/FlowFieldGrid.js";
import { HpaPathWorker } from "../Libraries/Pathfinding/HpaPathWorker.js";
import { HpaPathSession } from "../Libraries/Pathfinding/HpaPathSession.js";
import { NavRuntime } from "../Libraries/Navigation/NavRuntime.js";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { Scheduler } from "../Libraries/Scheduler/Scheduler.js";
import { WorldSurfaceEngine } from "../Libraries/WorldSurface/WorldSurfaceEngine.js";
import { WallCollisionResolver } from "../Libraries/Physics/physics.js";
import { EntityRegistry } from "./EntityRegistry.js";
import { KineticSession } from "./KineticSession.js";
import { FollowCamera } from "../Libraries/Sandbox/FollowCamera.js";
const navigationSettings = { recenterThreshold: 400, stuckReplanFrames: 60, stuckMoveThreshold: 1.5, pathOffPathDistance: 80 };
export class SharedGameState {
    constructor() {
        this.followCamera = new FollowCamera(this);
        this.scheduler = new Scheduler();
        this.phase = "simulation";
        this.obstacleGrid = new WorldObstacleGrid(gridSettings.cellSize);
        const worker = new HpaPathWorker(HPA_WORKER_URL, this.obstacleGrid);
        const session = new HpaPathSession(worker);
        this.flowFieldGrid = new FlowFieldGrid(gridSettings.cellSize, worldSpanPx(gridSettings.cols), worldSpanPx(gridSettings.rows), this.obstacleGrid, FLOW_FIELD_WORKER_URL, worker);
        this.nav = new NavRuntime({ grid: this.obstacleGrid, worker, session, flowFieldGrid: this.flowFieldGrid, settings: navigationSettings });
        this.worldSurfaces = new WorldSurfaceEngine(gameWorldSurfaceSettings);
        this.viewport = null;
        this.lastTime = 0;
        this.gameTime = 0;
        this.selectedSpeed = 1.0;
        this.isPaused = false;
        this.debugMode = false;
        this.radioSeenThisRun = {};
        this.worldProps = [];
        this.projectiles = [];
        this.entityRegistry = new EntityRegistry();
        this.kinetic = new KineticSession();
        this.wallResolver = new WallCollisionResolver();
        this.obstacleGrid.rebuildFixed(0, 0, worldSpanPx(gridSettings.cols), worldSpanPx(gridSettings.rows));
        void this.nav.commitEdit(null, { fullNavSync: true });
    }
}
