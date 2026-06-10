import { gridSettings } from "../Config/Config.js";
import { engine } from "../Apps/Editor/engine.js";
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
        this.mapNodes = [];
        this.mapNodeById = new Map();
        this.currentNodeId = 0;
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
    getMapSpawnOrigin() {
        const viewW = this.viewport?.width ?? 0;
        const viewH = this.viewport?.height ?? 0;
        return { x: this.mapBaseSpawnX !== undefined ? this.mapBaseSpawnX : viewW > 0 ? viewW / 2 : 225, y: this.mapBaseSpawnY !== undefined ? this.mapBaseSpawnY : viewH > 0 ? viewH / 2 : 225 };
    }
    getNodeWorldCoords(node) {
        if (!node) return { x: 0, y: 0 };
        const { x: baseSpawnX, y: baseSpawnY } = this.getMapSpawnOrigin();
        const scale = engine.worldGen.nodeWorldCoordScale;
        return { x: baseSpawnX + node.x * scale, y: baseSpawnY + node.y * scale };
    }
    rebuildMapNodeIndex() {
        this.mapNodeById.clear();
        for (const node of this.mapNodes) this.mapNodeById.set(node.id, node);
    }
    getMapNode(id) {
        if (id == null) return null;
        return this.mapNodeById.get(id) ?? null;
    }
    getStartMapNode() {
        return this.getMapNode(0);
    }
    getCurrentMapNode() {
        return this.getMapNode(this.currentNodeId);
    }
}
