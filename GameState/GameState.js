import { Turret } from "../Entities/Turret.js";
import { Player } from "../Entities/Player.js";
import { FlowFieldGrid } from "../Spatial/Navigation/FlowFieldGrid.js";
import { WorldObstacleGrid } from "../Spatial/World/ObstacleGrid.js";
import { HierarchicalNavigator } from "../Spatial/Navigation/HierarchicalNavigator.js";
import { NavigationService } from "../Spatial/Navigation/NavigationService.js";
import { gridSettings, mapSettings, runBaseStats } from "../Config/Config.js";
import { Scheduler } from "../Core/Scheduler.js";
import { WaveManager } from "../Combat/WaveManager.js";
import { SpatialHash } from "../Spatial/World/SpatialHash.js";
import { Pools } from "../Core/Pools.js";
import { createRunStats } from "../Entities/CombatantStats.js";

export class GameState {
    constructor() {
        this.fsm = null;
        this.scheduler = new Scheduler();
        this.waveManager = new WaveManager();
        this._phase = "map";
        this.mapNodes = [];
        this.mapNodeById = new Map();
        this.currentNodeId = 0;
        this.mapPlayerX = 0;
        this.mapPlayerY = 0;
        this.mapTargetNodeId = null;
        this.highestLevelReached = 0;
        this.claimedPerkMilestones = [];
        this.discoveredAbilities = new Set();

        this.runStats = createRunStats(runBaseStats);
        this.player = new Player(0, 0, 8);
        this.player.turrets = [new Turret(0, this.player.stats.turnSpeed.value)];

        this.obstacleGrid = new WorldObstacleGrid(gridSettings.cellSize);
        this.flowFieldGrid = new FlowFieldGrid(gridSettings.cellSize, gridSettings.width, gridSettings.height, this.obstacleGrid);
        this.hierarchicalNavigator = new HierarchicalNavigator(gridSettings.cellSize, gridSettings.maxCellsPerChunk, gridSettings.minCellsPerChunk, this.obstacleGrid);
        this.navigation = new NavigationService(this.flowFieldGrid, this.hierarchicalNavigator);
        this.currentUpgradeTab = "attack";
        this.canvasBounds = { width: 0, height: 0 };
        this.upgradeDefs = [];
        this.wallSpatialHash = new SpatialHash(100);

        this.initializeDefaultState();
    }

    getCombatSpawnOrigin() {
        return {
            x: this.mapBaseSpawnX !== undefined ? this.mapBaseSpawnX : (this.canvasBounds.width > 0 ? this.canvasBounds.width / 2 : 225),
            y: this.mapBaseSpawnY !== undefined ? this.mapBaseSpawnY : (this.canvasBounds.height > 0 ? this.canvasBounds.height / 2 : 225),
        };
    }

    getNodeCombatCoords(node) {
        if (!node) return { x: 0, y: 0 };
        const { x: baseSpawnX, y: baseSpawnY } = this.getCombatSpawnOrigin();
        const scale = mapSettings.combatCoordScale;
        return {
            x: baseSpawnX + node.x * scale,
            y: baseSpawnY + node.y * scale,
        };
    }

    rebuildMapNodeIndex() {
        this.mapNodeById.clear();
        for (const node of this.mapNodes) {
            this.mapNodeById.set(node.id, node);
        }
    }

    getMapNode(id) {
        if (id == null) return null;
        return this.mapNodeById.get(id) ?? null;
    }

    getCurrentMapNode() {
        return this.getMapNode(this.currentNodeId);
    }

    getMapTargetNode() {
        return this.getMapNode(this.mapTargetNodeId);
    }

    get phase() {
        return this.fsm?.currentStateName ?? this._phase;
    }

    set phase(value) {
        this._phase = value;
    }

    initializeDefaultState() {
        this.scheduler.clear();
        this.waveManager.reset();
        this.lastTime = 0;
        this.score = 0;
        this.xp = 0;
        this.level = 0;
        this.pendingLevelUps = 0;
        this.kills = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.debugMode = false;
        this.spawnRadius = 950;
        this.pendingPerkPicks = [];

        this.wavesCompleted = 0;
        this.isTransitioning = false;

        this.abilities = {};
        this.abilityTimers = {};
        this.pendingUnlocks = [];

        this.player.fullHeal();
        this.player.clearHealAccumulator();
        this.player.isDead = false;
        this.player.changeState("navigating");
        this.player.turrets = [new Turret(0, this.player.stats.turnSpeed.value)];

        this.enemies = [];
        if (this.projectiles) {
            for (let i = 0; i < this.projectiles.length; i++) {
                Pools.projectiles.release(this.projectiles[i]);
            }
        }
        this.projectiles = [];
        this.floatingTexts = [];
        this.walls = [];
        this.walls.spatialHash = this.wallSpatialHash;
        this.pickups = [];
        this.activeLasers = [];
        this.flowFieldGrid.clear();

        this.entityLayers = [
            { key: "projectiles", zIndex: 20 },
            { key: "enemies", zIndex: 30 },
            { key: "activeLasers", zIndex: 35 },
            { key: "floatingTexts", zIndex: 90 },
        ];

        this.selectedSpeed = 1.0;
    }
}

export const state = new GameState();
