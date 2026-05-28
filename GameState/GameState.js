import { Projectile } from "../Entities/Projectile.js";
import { Turret } from "../Entities/Turret.js";
import { Player } from "../Entities/Player.js";
import { FlowFieldGrid } from "../Spatial/Navigation/FlowFieldGrid.js";
import { WorldObstacleGrid } from "../Spatial/World/ObstacleGrid.js";
import { HierarchicalNavigator } from "../Spatial/Navigation/HierarchicalNavigator.js";
import { NavigationService } from "../Spatial/Navigation/NavigationService.js";
import { enemyTypes, defaultUpgradeCost, perkMilestones, playerBaseStats, gridSettings, mapSettings } from "../Config/Config.js";
import { WallGenerator } from "../Generator/Generator.js";
import { FloatingText } from "../Render/FloatingText.js";
import { Scheduler } from "../Core/Scheduler.js";
import { WaveManager } from "../Combat/WaveManager.js";
import { Segment } from "../Entities/Wall.js";
import { GeneratorStrategies } from "../Generator/GeneratorStrategies.js";
import { SpatialHash } from "../Spatial/World/SpatialHash.js";

export class Stat {
    constructor(baseValue, min = -Infinity, max = Infinity) {
        this.baseValue = baseValue;
        this.min = min;
        this.max = max;
        this.flatModifiers = 0;
        this.multiplierModifiers = 1.0;
    }

    get value() {
        let val = (this.baseValue + this.flatModifiers) * this.multiplierModifiers;
        return Math.max(this.min, Math.min(this.max, val));
    }

    reset() {
        this.flatModifiers = 0;
        this.multiplierModifiers = 1.0;
    }
}

export class GameState {
    get weapon() {
        return this.player ? this.player.weapon : null;
    }

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

    transitionPhase(phaseName) {
        this.phase = phaseName;
        if (this.fsm) this.fsm.transition(phaseName);
    }

    enterRewardPhase() {
        this.transitionPhase("reward");
    }

    enterMapPhase() {
        this.transitionPhase("map");
    }

    startRun() {
        this.mapTargetNodeId = 0;
        this.transitionPhase("map_transition");
    }

    enterCombatPhase() {
        this.transitionPhase("combat");
    }

    updateMapTransition(dt, viewport) {
        const targetNode = this.mapNodes.find((n) => n.id === this.mapTargetNodeId);
        if (targetNode) {
            const dx = targetNode.x - this.mapPlayerX;
            const dy = targetNode.y - this.mapPlayerY;
            const dist = Math.hypot(dx, dy);
            const speed = 150;
            if (dist === 0 || dist <= speed * (dt / 1000)) {
                this.mapPlayerX = targetNode.x;
                this.mapPlayerY = targetNode.y;
                this.currentNodeId = targetNode.id;
                if (!targetNode.completed) {
                    this.transitionPhase("combat");
                } else {
                    this.transitionPhase("map");
                }
                return true;
            } else {
                this.mapPlayerX += (dx / dist) * speed * (dt / 1000);
                this.mapPlayerY += (dy / dist) * speed * (dt / 1000);
            }
        }
        return false;
    }

    initUpgradesList(upgradeList) {
        this.upgradeDefs = upgradeList;
        if (Object.keys(this.upgrades).length === 0) {
            for (const upg of upgradeList) {
                this.upgrades[upg.id] = { level: 0, baseLevel: 0, ptsCost: defaultUpgradeCost };
            }
            this.resetUpgradesToDefault();
        }
        for (const upg of upgradeList) {
            if (upg.isAbility && !this.abilityTimers[upg.id]) {
                this.abilityTimers[upg.id] = { readyTime: 0, activeUntil: 0, activeId: null, cooldownId: null };
            }
        }
    }

    resetRun(upgradesList) {
        this.initializeDefaultState();
        this.mapTargetNodeId = 0;

        if (upgradesList) {
            upgradesList.forEach((upg) => {
                if (upg.isAbility) {
                    this.abilityTimers[upg.id] = { readyTime: 0, activeUntil: 0, activeId: null, cooldownId: null };
                }
            });
        }

        this.recalculateStats(upgradesList);
        for (const key in this.upgrades) {
            if (upgradesList) {
                const upgDef = upgradesList.find((u) => u.id === key);
                if (upgDef) {
                    if (upgDef.isAbility) {
                        if (this.player && this.player.startingAbilities && this.player.startingAbilities.includes(key)) {
                            this.upgrades[key].baseLevel = 1;
                        } else {
                            this.upgrades[key].baseLevel = 0;
                        }
                    }
                    this.upgrades[key].baseLevel = Math.min(this.upgrades[key].baseLevel, upgDef.maxLevel);
                }
            }
            this.upgrades[key].level = this.upgrades[key].baseLevel;
            this.upgrades[key].ptsCost = this.stats.baseUpgradeCost.value;
        }

        if (this.player && this.player.startingAbilities) {
            this.player.startingAbilities.forEach((abilityId) => {
                this.abilities[abilityId] = true;
            });
        }

        if (upgradesList) {
            upgradesList.forEach((upg) => {
                if (upg.onRunStart && this.upgrades[upg.id] && this.upgrades[upg.id].baseLevel > 0) upg.onRunStart(this);
            });
        }

        this.recalculateStats(upgradesList);
        this.generateMap();

        const startNode = this.mapNodes.find(n => n.id === 0);
        if (startNode) {
            const coords = this.getNodeCombatCoords(startNode);
            this.player.setSpawnPosition(coords.x, coords.y);
            this.player.resetToSpawn();
        }
    }

    getNodeCombatCoords(node) {
        if (!node) return { x: 0, y: 0 };
        const scale = 7.0;
        const baseSpawnX = this.mapBaseSpawnX !== undefined ? this.mapBaseSpawnX : (this.canvasBounds.width > 0 ? this.canvasBounds.width / 2 : 225);
        const baseSpawnY = this.mapBaseSpawnY !== undefined ? this.mapBaseSpawnY : (this.canvasBounds.height > 0 ? this.canvasBounds.height / 2 : 225);
        return {
            x: baseSpawnX + node.x * scale,
            y: baseSpawnY + node.y * scale
        };
    }

    grantXP(amount) {
        this.xp += amount;
        let xpNeeded = Math.floor(25 * Math.pow(1.5, this.level));
        while (this.xp >= xpNeeded) {
            this.xp -= xpNeeded;
            this.level++;
            if (perkMilestones.includes(this.level) && !this.claimedPerkMilestones.includes(this.level)) {
                this.pendingPerkPicks.push(this.level);
                this.claimedPerkMilestones.push(this.level);
            }
            this.pendingLevelUps++;
            if (this.level > this.highestLevelReached) this.highestLevelReached = this.level;
            xpNeeded = Math.floor(25 * Math.pow(1.5, this.level));
            FloatingText.spawn(this, this.player.x, this.player.y - 40, "LEVEL UP", "#FFEB3B");
        }
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

    recalculateStats(upgradesList) {
        for (const key in this.stats) {
            this.stats[key].reset();
        }
        if (upgradesList) {
            upgradesList.forEach((upg) => {
                const level = this.upgrades[upg.id] ? this.upgrades[upg.id].level : 0;
                if (level > 0 && upg.applyFn) {
                    if (upg.isAbility && !this.abilities[upg.id]) return;
                    upg.applyFn(this.stats, level);
                }
            });
        }

        this.weapon.accuracyModifier = 0;
        this.weapon.damage = this.stats.damage.value;
        this.weapon.range = this.stats.range.value;
        this.weapon.chargeTime = this.stats.chargeTime.value;
        this.weapon.penetration = this.stats.penetration.value;

        this.gameSpeed = this.stats.gameSpeed.value;
        this.selectedSpeed = Math.min(this.selectedSpeed, this.gameSpeed);
        this.pointBonus = this.stats.pointBonus.value;
        this.player.updateMaxHealth(this.stats.maxHealth.value);
        this.player.speed = playerBaseStats.speed * this.stats.moveSpeedMultiplier.value;
        this.player.turrets = this.turrets;

        const targetTurretCount = Math.floor(this.stats.turretCount.value);
        while (this.turrets.length < targetTurretCount) {
            const newAngle = (this.turrets.length / targetTurretCount) * Math.PI * 2;
            this.turrets.push(new Turret(newAngle, this.stats.turnSpeed.value));
        }
        while (this.turrets.length > targetTurretCount) {
            this.turrets.pop();
        }
        this.turrets.forEach(t => t.turnSpeed = this.stats.turnSpeed.value);

        if (upgradesList) {
            upgradesList.forEach((upg) => {
                if (upg.isAbility && this.abilities && this.abilities[upg.id] && upg.abilityApplyFn) {
                    upg.abilityApplyFn(this.weapon, this.player);
                }
            });
        }
    }

    resetUpgradesToDefault() {
        for (const key in this.upgrades) {
            this.upgrades[key].baseLevel = 0;
            this.upgrades[key].level = 0;
        }
    }

    generateMap() {
        this.mapBaseSpawnX = this.canvasBounds.width > 0 ? this.canvasBounds.width / 2 : 225;
        this.mapBaseSpawnY = this.canvasBounds.height > 0 ? this.canvasBounds.height / 2 : 225;
        this.mapNodes = [];
        const numLayers = mapSettings.numLayers;
        const layerSpacing = mapSettings.layerSpacing;
        const xSpacing = mapSettings.xSpacing;

        let nodeIdCounter = 0;
        let layers = [];

        this.mapNodes.push({ id: nodeIdCounter++, x: 0, y: 0, connections: [], completed: false, wavesTotal: 1, reward: null, type: "combat", layer: 0 });
        layers.push([this.mapNodes[0]]);

        for (let l = 1; l < numLayers; l++) {
            let layerNodes = [];
            let numNodesInLayer = Math.floor(Math.random() * 3) + 2;
            let startX = -((numNodesInLayer - 1) * xSpacing) / 2;

            for (let i = 0; i < numNodesInLayer; i++) {
                let jitterX = (Math.random() - 0.5) * 40;
                let jitterY = (Math.random() - 0.5) * 40;

                let type = "combat";
                let reward = { type: "random_permanent_upgrade" };

                let node = {
                    id: nodeIdCounter++,
                    x: startX + i * xSpacing + jitterX,
                    y: -l * layerSpacing + jitterY,
                    connections: [],
                    completed: false,
                    wavesTotal: Math.floor(Math.random() * 5) + 1,
                    reward: reward,
                    type: type,
                    layer: l,
                };
                layerNodes.push(node);
                this.mapNodes.push(node);
            }
            layers.push(layerNodes);
        }

        for (let l = 0; l < numLayers - 1; l++) {
            let currentLayer = layers[l];
            let nextLayer = layers[l + 1];

            currentLayer.forEach((node, i) => {
                let targetIndex = Math.floor((i / currentLayer.length) * nextLayer.length);
                node.connections.push(nextLayer[targetIndex].id);
            });

            nextLayer.forEach((nextNode, j) => {
                let hasIncoming = currentLayer.some((n) => n.connections.includes(nextNode.id));
                if (!hasIncoming) {
                    let closestNode = currentLayer[Math.floor((j / nextLayer.length) * currentLayer.length)];
                    if (!closestNode.connections.includes(nextNode.id)) {
                        closestNode.connections.push(nextNode.id);
                    }
                }
            });

            currentLayer.forEach((node, i) => {
                if (Math.random() < 0.3) {
                    let targetIndex = Math.floor((i / currentLayer.length) * nextLayer.length);
                    let altTarget = targetIndex + (Math.random() < 0.5 ? 1 : -1);
                    if (altTarget >= 0 && altTarget < nextLayer.length) {
                        if (!node.connections.includes(nextLayer[altTarget].id)) {
                            node.connections.push(nextLayer[altTarget].id);
                        }
                    }
                }
            });
        }

        this.currentNodeId = 0;
        this.mapPlayerX = 0;
        this.mapPlayerY = 0;
 
        this.pregenerateAllCombatData();

        this.walls = [];
        this.walls.spatialHash = this.wallSpatialHash;
        this.wallSpatialHash.clear();
        for (const node of this.mapNodes) {
            if (node.wallsData) {
                for (const w of node.wallsData) {
                    const segment = new Segment(w.x, w.y, w.angle, w.size, w.padding, w.maxHealth);
                    segment.theme = node.wallTheme || { r: 0, g: 188, b: 212 };
                    this.walls.push(segment);
                    this.wallSpatialHash.insert(segment);
                }
            }
        }
        this.walls.obstacleGrid = this.obstacleGrid;
        this.obstacleGrid.rebuild(this.walls);
        this.hierarchicalNavigator.initialize();
    }

    pregenerateAllCombatData() {
        const themeColors = [
            { r: 0, g: 188, b: 212 },
            { r: 76, g: 175, b: 80 },
            { r: 255, g: 152, b: 0 },
            { r: 156, g: 39, b: 176 },
            { r: 63, g: 81, b: 181 },
            { r: 244, g: 67, b: 54 },
            { r: 233, g: 30, b: 99 },
            { r: 0, g: 150, b: 136 },
            { r: 205, g: 220, b: 57 },
            { r: 121, g: 85, b: 72 }
        ];

        const strategies = Object.keys(GeneratorStrategies);

        const createMockNavigation = (centerX, centerY) => {
            const obstacleGrid = new WorldObstacleGrid(gridSettings.cellSize);
            const flowFieldGrid = new FlowFieldGrid(gridSettings.cellSize, gridSettings.width, gridSettings.height, obstacleGrid);
            flowFieldGrid.centerX = centerX;
            flowFieldGrid.centerY = centerY;
            return { obstacleGrid, flowFieldGrid };
        };

        const checkPathability = (nodeA, nodeB, wallsA, wallsB) => {
            const coordsA = this.getNodeCombatCoords(nodeA);
            const coordsB = this.getNodeCombatCoords(nodeB);
            const mx = (coordsA.x + coordsB.x) / 2;
            const my = (coordsA.y + coordsB.y) / 2;

            const { obstacleGrid, flowFieldGrid: tempGrid } = createMockNavigation(mx, my);

            const segments = [];
            for (const w of wallsA) {
                segments.push(new Segment(w.x, w.y, w.angle, w.size, w.padding, w.maxHealth));
            }
            for (const w of wallsB) {
                segments.push(new Segment(w.x, w.y, w.angle, w.size, w.padding, w.maxHealth));
            }

            obstacleGrid.rebuild(segments);
            tempGrid.refresh(coordsB.x, coordsB.y);

            const startPos = tempGrid.worldToGrid(coordsA.x, coordsA.y);
            if (startPos.col < 0 || startPos.col >= tempGrid.cols || startPos.row < 0 || startPos.row >= tempGrid.rows) {
                return false;
            }
            const idx = startPos.row * tempGrid.cols + startPos.col;
            return tempGrid.flowField[idx] !== null;
        };

        const startNode = this.mapNodes.find(n => n.id === 0);
        if (startNode) {
            const strategy = strategies[Math.floor(Math.random() * strategies.length)];
            const theme = themeColors[Math.floor(Math.random() * themeColors.length)];
            const coords = this.getNodeCombatCoords(startNode);
            
            const { obstacleGrid, flowFieldGrid } = createMockNavigation(coords.x, coords.y);
            const mockState = {
                walls: [],
                obstacleGrid,
                flowFieldGrid,
                waveManager: this.waveManager
            };

            GeneratorStrategies[strategy].generate(mockState, coords.x, coords.y);
            
            startNode.wallsData = mockState.walls.map(w => ({
                x: w.x,
                y: w.y,
                angle: w.angle,
                size: w.size,
                padding: w.padding,
                maxHealth: w.maxHealth || 30
            }));
            startNode.wallTheme = theme;
            startNode.strategy = strategy;
        }

        const numLayers = mapSettings.numLayers;
        for (let l = 1; l < numLayers; l++) {
            const layerNodes = this.mapNodes.filter(n => n.layer === l);
            for (const nodeB of layerNodes) {
                const incomingNodes = this.mapNodes.filter(n => n.connections.includes(nodeB.id));

                let attempts = 0;
                let success = false;
                let chosenWalls = [];
                let chosenTheme = null;
                let chosenStrategy = null;

                while (!success && attempts < 50) {
                    attempts++;
                    const strategy = strategies[Math.floor(Math.random() * strategies.length)];
                    const theme = themeColors[Math.floor(Math.random() * themeColors.length)];
                    const coordsB = this.getNodeCombatCoords(nodeB);

                    const { obstacleGrid, flowFieldGrid } = createMockNavigation(coordsB.x, coordsB.y);
                    const mockState = {
                        walls: [],
                        obstacleGrid,
                        flowFieldGrid,
                        waveManager: this.waveManager
                    };

                    GeneratorStrategies[strategy].generate(mockState, coordsB.x, coordsB.y);

                    const wallsB = mockState.walls.map(w => ({
                        x: w.x,
                        y: w.y,
                        angle: w.angle,
                        size: w.size,
                        padding: w.padding,
                        maxHealth: w.maxHealth || 30
                    }));

                    let allPathable = true;
                    for (const nodeA of incomingNodes) {
                        if (!checkPathability(nodeA, nodeB, nodeA.wallsData || [], wallsB)) {
                            allPathable = false;
                            break;
                        }
                    }

                    if (allPathable) {
                        chosenWalls = wallsB;
                        chosenTheme = theme;
                        chosenStrategy = strategy;
                        success = true;
                    }
                }

                if (!success) {
                    chosenWalls = [];
                    chosenTheme = themeColors[0];
                    chosenStrategy = "None";
                }

                nodeB.wallsData = chosenWalls;
                nodeB.wallTheme = chosenTheme;
                nodeB.strategy = chosenStrategy;
            }
        }
    }
}

export const state = new GameState();