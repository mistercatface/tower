import { Stat } from "./Stat.js";
import { Turret } from "../Entities/Turret.js";
import { Player } from "../Entities/Player.js";
import { FlowFieldGrid } from "../Spatial/Navigation/FlowFieldGrid.js";
import { WorldObstacleGrid } from "../Spatial/World/ObstacleGrid.js";
import { HierarchicalNavigator } from "../Spatial/Navigation/HierarchicalNavigator.js";
import { NavigationService } from "../Spatial/Navigation/NavigationService.js";
import { defaultUpgradeCost, playerBaseStats, gridSettings, mapSettings } from "../Config/Config.js";
import { Scheduler } from "../Core/Scheduler.js";
import { WaveManager } from "../Combat/WaveManager.js";
import { SpatialHash } from "../Spatial/World/SpatialHash.js";

export class GameState {
    constructor() {
        this.fsm = null;
        this.scheduler = new Scheduler();
        this.waveManager = new WaveManager();
        this.phase = "map";
        this.mapNodes = [];
        this.currentNodeId = 0;
        this.highestLayerGenerated = 0;
        this.mapPlayerX = 0;
        this.mapPlayerY = 0;
        this.mapTargetNodeId = null;
        this.highestLevelReached = 0;
        this.claimedPerkMilestones = [];
        this.discoveredAbilities = new Set();
 
        this.stats = {
            damage: new Stat(playerBaseStats.damage),
            turnSpeed: new Stat(playerBaseStats.turnSpeed),
            chargeTime: new Stat(playerBaseStats.chargeTime, playerBaseStats.minChargeTime, playerBaseStats.maxChargeTime),
            range: new Stat(playerBaseStats.range),
            maxHealth: new Stat(playerBaseStats.maxHealth),
            gameSpeed: new Stat(playerBaseStats.gameSpeed),
            pointBonus: new Stat(0),
            accuracy: new Stat(playerBaseStats.accuracy),
            penetration: new Stat(playerBaseStats.penetration),
            moveSpeedMultiplier: new Stat(playerBaseStats.moveSpeedMultiplier),
            baseUpgradeCost: new Stat(defaultUpgradeCost),
            turretCount: new Stat(playerBaseStats.turretCount),
        };
 
        this.player = new Player(0, 0, 8, this.stats.maxHealth.value);
        this.turrets = [new Turret(0, this.stats.turnSpeed.value)];
 
        const self = this;
        this.player.weapon = {
            chargeTime: playerBaseStats.chargeTime,
            range: playerBaseStats.range,
            damage: playerBaseStats.damage,
            penetration: playerBaseStats.penetration,
            accuracyModifier: 0,
            get accuracy() {
                let acc = self.stats.accuracy.value;
                acc += this.accuracyModifier;
                return Math.min(1, acc);
            },
        };
 
        this.obstacleGrid = new WorldObstacleGrid(gridSettings.cellSize);
        this.flowFieldGrid = new FlowFieldGrid(gridSettings.cellSize, gridSettings.width, gridSettings.height, this.obstacleGrid);
        this.hierarchicalNavigator = new HierarchicalNavigator(gridSettings.cellSize, gridSettings.maxCellsPerChunk, gridSettings.minCellsPerChunk, this.obstacleGrid);
        this.navigation = new NavigationService(this.flowFieldGrid, this.hierarchicalNavigator);
        this.currentUpgradeTab = "attack";
        this.canvasBounds = { width: 0, height: 0 };
        this.upgrades = {};
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
        this.turrets = [new Turret(0, 10)];

        this.enemies = [];
        this.projectiles = [];
        this.floatingTexts = [];
        this.walls = [];
        this.walls.spatialHash = this.wallSpatialHash;
        this.pickups = [];
        this.activeLasers = [];
        this.flowFieldGrid.clear();

        this.entityLayers = [
            { key: "pickups", zIndex: 10 },
            { key: "projectiles", zIndex: 20 },
            { key: "enemies", zIndex: 30 },
            { key: "activeLasers", zIndex: 35 },
            { key: "floatingTexts", zIndex: 90 },
        ];

        this.gameSpeed = 2.0;
        this.selectedSpeed = 1.0;
        this.pointBonus = 0;
    }
}

export const state = new GameState();