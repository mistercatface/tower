import { FLOW_FIELD_WORKER_URL } from "../../Render/WorldSurfaceBootstrap.js";
import { Player } from "./entities/Player.js";
import { Sidekick } from "./entities/Sidekick.js";
import { getAllyDefinition, getRunParty } from "./entities/EntityRegistry.js";
import { FlowFieldGrid } from "../../Libraries/Pathfinding/FlowFieldGrid.js";
import { NavigationService } from "../../Systems/Navigation/NavigationService.js";
import { combatActorRadius, gridSettings, runBaseStats } from "../../Config/Config.js";
import { HordeSpawner } from "./HordeSpawner.js";
import { TurretController } from "./TurretController.js";
import { towerPools } from "./pools.js";
import { createRunStats } from "./entities/CombatantStats.js";
import { SharedGameState } from "../../GameState/SharedGameState.js";
import { createCombatWallResolver } from "../../Systems/Motion/createCombatWallResolver.js";
export class TowerGameState extends SharedGameState {
    constructor() {
        super();
        this.wallResolver = createCombatWallResolver(() => this);
        this.entityLayers = [
            { key: "projectiles", zIndex: 20 },
            { key: "ragdollCorpses", zIndex: 24 },
            { key: "activeLasers", zIndex: 35 },
            { key: "floatingTexts", zIndex: 90 },
        ];
        this._combatEventBuffer = [];
        this._hordeSpawner = null;
        this.highestLevelReached = 0;
        this.claimedPerkMilestones = [];
        this.discoveredAbilities = new Set();
        this.runStats = createRunStats(runBaseStats);
        this.player = new Player(0, 0, combatActorRadius);
        this.player.turretController = new TurretController(this.player);
        this.player.teamId = 0;
        this.allies = [];
        this.flowFieldGrid = new FlowFieldGrid(gridSettings.cellSize, gridSettings.width, gridSettings.height, this.obstacleGrid, FLOW_FIELD_WORKER_URL);
        this.navigation = new NavigationService(this.flowFieldGrid, this.hierarchicalNavigator);
        this.currentUpgradeTab = "stats";
        this.statsSubTab = "attack";
        this.upgradeDefs = [];
        this.projectilePool = towerPools.projectiles;
        this.mapWallCache = null;
        this.mapLabWallCache = null;
        this.mapPathDebugCache = null;
        this._combatantsCache = [];
        this.inspectPanelOpen = false;
        this.initializeDefaultState();
    }
    get hordeSpawner() {
        if (!this._hordeSpawner) this._hordeSpawner = new HordeSpawner();
        return this._hordeSpawner;
    }
    getMapPlayerGraphCoords() {
        const node = this.getStartMapNode();
        return { x: node?.x ?? 0, y: node?.y ?? 0 };
    }
    beginCombatEvents() {
        this._combatEventBuffer.length = 0;
        return this._combatEventBuffer;
    }
    initializeDefaultState() {
        this.scheduler.clear();
        this._hordeSpawner?.reset();
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
        this.pendingPerkPicks = [];
        this.radioSeenThisRun = {};
        this.runScene = null;
        this.inspectPanelOpen = false;
        this.skipSimulationEnterReset = false;
        this.runSceneInitialized = false;
        this.startPropsSpawned = false;
        this.zombieEventTriggered = false;
        this.abilities = {};
        this.abilityTimers = {};
        this.player.fullHeal();
        this.player.clearHealAccumulator();
        this.player.isDead = false;
        this.player.changeState("navigating");
        this.enemies = [];
        if (this.projectiles) for (let i = 0; i < this.projectiles.length; i++) this.projectilePool.release(this.projectiles[i]);
        this.projectiles = [];
        this.floatingTexts = [];
        this.walls = [];
        this.pickups = [];
        this.activeLasers = [];
        this.combatParticles = [];
        this.ragdollCorpses = [];
        this.flowFieldGrid.clear();
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
        if (this.player && !this.player.isDead) party.push(this.player);
        party.push(...this.getAllies());
        return party;
    }
    getPlayerActors() {
        return this.getParty();
    }
    spawnRunParty(partyIds) {
        const leader = this.getLeader();
        const ids = partyIds ?? getRunParty();
        this.allies = [];
        for (let i = 0; i < ids.length; i++) {
            const definition = getAllyDefinition(ids[i]);
            if (!definition) continue;
            const ally = Sidekick.create(leader.x, leader.y, definition);
            ally.leader = leader;
            ally.teamId = leader.teamId ?? 0;
            const angle = leader.angle + Math.PI + (i - (ids.length - 1) / 2) * 0.5;
            const dist = 48;
            const x = leader.x + Math.cos(angle) * dist;
            const y = leader.y + Math.sin(angle) * dist;
            ally.spawnAt(x, y, leader);
            ally.applyWeaponLoadout(ally.weaponLoadout, { state: this, upgradeDefs: this.upgradeDefs });
            this.allies.push(ally);
        }
        return this.allies;
    }
    getHostileActors() {
        return this.enemies.filter((actor) => !actor.isDead);
    }
    getCombatants() {
        const cache = this._combatantsCache;
        cache.length = 0;
        if (this.player && !this.player.isDead) cache.push(this.player);
        for (let i = 0; i < this.allies.length; i++) {
            const ally = this.allies[i];
            if (!ally.isDead) cache.push(ally);
        }
        for (let i = 0; i < this.enemies.length; i++) {
            const enemy = this.enemies[i];
            if (!enemy.isDead) cache.push(enemy);
        }
        return cache;
    }
    updateAllCombatants(dt, spatialFrame, options = {}) {
        this.activeLasers = [];
        const combatEvents = options.combatEvents ?? this.beginCombatEvents();
        for (const actor of this.getCombatants()) actor.updateCombat(dt, this, spatialFrame, { ...options, externalSpeedMod: actor.getExternalSpeedMod(this, options), combatEvents });
        for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].isDead) this.enemies.splice(i, 1);
        return combatEvents;
    }
}
