import "../Render/WorldSurfaceBootstrap.js";
import { Player } from "../Entities/Player.js";
import { Sidekick } from "../Entities/Sidekick.js";
import { FlowFieldGrid } from "../Libraries/Pathfinding/flow/FlowFieldGrid.js";
import { HierarchicalNavigator } from "../Libraries/Pathfinding/hpa/HierarchicalNavigator.js";
import { WorldObstacleGrid } from "../Spatial/World/ObstacleGrid.js";
import { NavigationService } from "../Spatial/Navigation/NavigationService.js";
import { combatActorRadius, gridSettings, mapSettings, navigationSettings, runBaseStats } from "../Config/Config.js";
import { Scheduler } from "../Core/Scheduler.js";
import { WaveManager } from "../Combat/WaveManager.js";
import { WallSpatialIndex } from "../Libraries/Spatial/indexes/WallSpatialIndex.js";
import { Pools } from "../Core/Pools.js";
import { createRunStats } from "../Entities/CombatantStats.js";
import { WorldSurfaceSystem } from "../Render/game/WorldSurfaceSystem.js";

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
        this.player = new Player(0, 0, combatActorRadius);
        this.player.teamId = 0;
        this.allies = [];

        this.obstacleGrid = new WorldObstacleGrid(gridSettings.cellSize);
        this.flowFieldGrid = new FlowFieldGrid(gridSettings.cellSize, gridSettings.width, gridSettings.height, this.obstacleGrid);
        this.hierarchicalNavigator = new HierarchicalNavigator(
            gridSettings.cellSize,
            gridSettings.maxCellsPerChunk,
            gridSettings.minCellsPerChunk,
            this.obstacleGrid,
            { damagePadding: navigationSettings.hpaDamagePadding },
        );
        this.navigation = new NavigationService(this.flowFieldGrid, this.hierarchicalNavigator);
        this.currentUpgradeTab = "stats";
        this.statsSubTab = "attack";
        this.canvasBounds = { width: 0, height: 0 };
        this.upgradeDefs = [];
        this.wallSpatialIndex = new WallSpatialIndex(100);
        this.worldSurfaces = new WorldSurfaceSystem();
        this.worldSurfaceSeed = 0;
        /** @type {string | null} Dev/preview override — see resolveSurfaceProfileAtPlayer */
        this.surfaceProfileOverride = null;
        this.mapWallCache = null;
        this.mapLabWallCache = null;
        this.mapPathDebugCache = null;

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
        this.gameTime = 0;
        this.score = 0;
        this.xp = 0;
        this.level = 0;
        this.pendingLevelUps = 0;
        this.kills = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.debugMode = false;
        this.combatHudMode = 0;
        this.spawnRadius = 950;
        this.pendingPerkPicks = [];
        this.radioSeenThisRun = {};
        this.startNodeIntroActive = false;
        this.startNodeIntroTriggered = false;
        this.startNodeIntroCompleted = false;
        this.startNodeGuardsDialogUnlocked = false;
        this.startNodeInspectionActive = false;
        this.startNodeInspectionSeen = null;
        this.startNodeInspectionPending = null;
        this.startNodeInspectionCompleted = false;
        this.startNodeInspectionFinishing = false;
        this.inspectPanelOpen = false;
        this.skipCombatEnterReset = false;
        this.zombieEventTriggered = false;

        this.wavesCompleted = 0;
        this.isTransitioning = false;

        this.abilities = {};
        this.abilityTimers = {};
        this.pendingUnlocks = [];

        this.player.fullHeal();
        this.player.clearHealAccumulator();
        this.player.isDead = false;
        this.player.changeState("navigating");

        this.enemies = [];
        if (this.projectiles) {
            for (let i = 0; i < this.projectiles.length; i++) {
                Pools.projectiles.release(this.projectiles[i]);
            }
        }
        this.projectiles = [];
        this.floatingTexts = [];
        this.walls = [];
        this.pickups = [];
        this.activeLasers = [];
        this.combatParticles = [];
        this.ragdollCorpses = [];
        this.flowFieldGrid.clear();

        this.entityLayers = [
            { key: "projectiles", zIndex: 20 },
            { key: "ragdollCorpses", zIndex: 24 },
            { key: "activeLasers", zIndex: 35 },
            { key: "floatingTexts", zIndex: 90 },
        ];

        this.selectedSpeed = 1.0;
        this.allies = [];
        this.worldSurfaces.clear();
    }

    getLeader() {
        return this.player;
    }

    getAllies() {
        return this.allies.filter((ally) => ally && !ally.isDead);
    }

    getParty() {
        const party = [];
        if (this.player && !this.player.isDead) {
            party.push(this.player);
        }
        party.push(...this.getAllies());
        return party;
    }

    getPlayerActors() {
        return this.getParty();
    }

    spawnRunParty(count = 1) {
        const leader = this.getLeader();
        this.allies = [];

        for (let i = 0; i < count; i++) {
            const ally = Sidekick.create(leader.x, leader.y, leader.radius);
            ally.leader = leader;
            ally.teamId = leader.teamId ?? 0;
            const angle = leader.angle + Math.PI + (i - (count - 1) / 2) * 0.5;
            const dist = 48;
            const x = leader.x + Math.cos(angle) * dist;
            const y = leader.y + Math.sin(angle) * dist;
            ally.spawnAt(x, y, leader);
            ally.applyWeaponLoadout(ally.weaponLoadout, {
                state: this,
                upgradeDefs: this.upgradeDefs,
            });
            this.allies.push(ally);
        }

        return this.allies;
    }

    getHostileActors() {
        return this.enemies.filter((actor) => !actor.isDead);
    }

    getCombatants() {
        return [...this.getPlayerActors(), ...this.getHostileActors()];
    }

    updateAllCombatants(dt, spatialFrame, options = {}) {
        this.activeLasers = [];
        const combatEvents = [];

        for (const actor of this.getCombatants()) {
            actor.updateCombat(dt, this, spatialFrame, {
                ...options,
                externalSpeedMod: actor.getExternalSpeedMod(this, options),
                combatEvents,
            });
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.enemies[i].isDead) {
                this.enemies.splice(i, 1);
            }
        }

        return combatEvents;
    }
}

export const state = new GameState();
