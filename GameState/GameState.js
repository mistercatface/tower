import { Turret } from "../Entities.js";
import { Planet } from "../Planet.js";
import { GridSystem } from "../GridSystem.js";
import { enemyTypes, defaultUpgradeCost } from "../Config.js";
import { WallGenerator } from "../Generator.js";

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
    constructor() {
        this.phase = "map";
        this.mapNodes = [];
        this.currentNodeId = 0;
        this.highestLayerGenerated = 0;
        this.mapPlayerX = 0;
        this.mapPlayerY = 0;
        this.mapTargetNodeId = null;
        this.highestLevelReached = 0;
        this.claimedPerkMilestones = [];

        this.stats = {
            damage: new Stat(1),
            turnSpeed: new Stat(Math.PI * 3),
            chargeTime: new Stat(1000, 100, 1000),
            range: new Stat(150),
            maxHealth: new Stat(100),
            gameSpeed: new Stat(2.0),
            pointBonus: new Stat(0),
            mitigation: new Stat(0, 0, 0.75),
            accuracy: new Stat(0.5),
            penetration: new Stat(0),
            moveSpeedMultiplier: new Stat(1.0),
            baseUpgradeCost: new Stat(defaultUpgradeCost),
        };

        this.planet = new Planet(0, 0, 8, this.stats.maxHealth.value);
        this.turret = new Turret(0, this.stats.turnSpeed.value);
        this.turret2 = new Turret(Math.PI, this.stats.turnSpeed.value);
        const self = this;
        this.weapon = {
            chargeTime: 1000,
            charge: 0,
            charge2: 0,
            range: 150,
            damage: 1,
            penetration: 0,
            accuracyModifier: 0,
            get accuracy() {
                let acc = self.stats.accuracy.value;
                if (self.planet && self.planet.isMoving) acc *= 0.5;
                acc += this.accuracyModifier;
                return Math.min(1, acc);
            },
        };

        this.gridSystem = new GridSystem(16, 1600, 1600);

        this.currentUpgradeTab = "attack";
        this.canvasBounds = { width: 0, height: 0 };
        this.upgrades = {};

        this.initializeDefaultState();
    }

    startWaveTransition(duration) {
        this.isTransitioning = true;
        this.waveTransitionTimer = duration;
    }

    tickWaveTransition(dt) {
        if (!this.isTransitioning) return false;
        this.waveTransitionTimer -= dt;
        if (this.waveTransitionTimer <= 0) {
            this.isTransitioning = false;
            return true;
        }
        return false;
    }

    enterRewardPhase() {
        this.phase = "reward";
    }

    enterMapPhase() {
        this.phase = "map";
    }

    enterCombatPhase() {
        this.phase = "combat";
        this.sectorWave = 1;
        this.wave++;
        this.pickups = [];
        this.planet.resetToSpawn();
        if (this.wave % 10 === 0) {
            this.enemiesToSpawn = 1;
        } else if (this.wave % 10 === 1 && this.wave > 1) {
            this.enemiesToSpawn = 5 + this.wave * 2;
        } else {
            if (this.wave === 1) this.enemiesToSpawn = 5;
            else this.enemiesToSpawn += 3;
        }
        this.enemiesSpawned = 0;
    }

    advanceWave() {
        this.sectorWave++;
        this.wave++;
        if (this.wave % 10 === 0) {
            this.enemiesToSpawn = 1;
        } else if (this.wave % 10 === 1 && this.wave > 1) {
            this.enemiesToSpawn = 5 + this.wave * 2;
        } else {
            if (this.wave === 1) this.enemiesToSpawn = 5;
            else this.enemiesToSpawn += 3;
        }
        this.enemiesSpawned = 0;
    }

    startRun() {
        this.mapTargetNodeId = 0;
        this.phase = "map_transition";
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
                    this.enterCombatPhase();
                    WallGenerator.generate(this);
                    const offsetX = this.mapPlayerX - viewport.x;
                    const offsetY = this.mapPlayerY - viewport.y;
                    viewport.snapTo(this.planet.x - offsetX, this.planet.y - offsetY);
                } else {
                    this.enterMapPhase();
                }
                return true;
            } else {
                this.mapPlayerX += (dx / dist) * speed * (dt / 1000);
                this.mapPlayerY += (dy / dist) * speed * (dt / 1000);
            }
        }
        return false;
    }

    resetRun(upgradesList) {
        this.initializeDefaultState();
        this.isTransitioning = false;
        this.waveTransitionTimer = 0;
        this.mapTargetNodeId = 0;
        
        this.recalculateStats(upgradesList);
        for (const key in this.upgrades) {
            if (upgradesList) {
                const upgDef = upgradesList.find((u) => u.id === key);
                if (upgDef && upgDef.isAbility) this.upgrades[key].baseLevel = 0;
            }
            this.upgrades[key].level = this.upgrades[key].baseLevel;
            this.upgrades[key].ptsCost = this.stats.baseUpgradeCost.value;
        }

        if (upgradesList) {
            upgradesList.forEach((upg) => {
                if (upg.onRunStart && this.upgrades[upg.id] && this.upgrades[upg.id].baseLevel > 0) upg.onRunStart(this);
            });
        }

        this.recalculateStats(upgradesList);
        this.generateMap();
    }

    initUpgradesList(upgradeList) {
        this.upgradeDefs = upgradeList;
        if (Object.keys(this.upgrades).length === 0) {
            for (const upg of upgradeList) {
                this.upgrades[upg.id] = { level: 0, baseLevel: 0, ptsCost: defaultUpgradeCost };
            }
            this.resetUpgradesToDefault();
        }
    }

    initializeDefaultState() {
        this.lastTime = 0;
        this.enemySpawnTimer = 0;
        this.score = 0;
        this.xp = 0;
        this.level = 0;
        this.pendingLevelUps = 0;
        this.wave = 0;
        this.sectorWave = 0;
        this.kills = 0;
        this.enemiesToSpawn = 5;
        this.enemiesSpawned = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.spawnRadius = 650;
        this.pendingPerkPicks = [];

        this.wavesCompleted = 0;

        this.abilities = {};
        this.abilityTimers = {};
        this.pendingUnlocks = [];

        this.planet.fullHeal();
        this.planet.clearHealAccumulator();
        this.weapon.charge = 0;
        this.weapon.charge2 = 0;
        this.turret.angle = 0;
        this.turret2.angle = Math.PI;

        this.enemies = [];
        this.projectiles = [];
        this.floatingTexts = [];
        this.walls = [];
        this.pickups = [];
        this.activeLasers = [];
        this.gridSystem.clear();
        this.currentTarget = null;
        this.currentTarget2 = null;

        this.gameSpeed = 2.0;
        this.selectedSpeed = 1.0;
        this.pointBonus = 0;
        this.mitigation = 0.0;
        this.dirtySegments = new Set();
    }

    recalculateStats(upgradesList) {
        for (const key in this.stats) {
            this.stats[key].reset();
        }
        if (upgradesList) {
            upgradesList.forEach((upg) => {
                const level = this.upgrades[upg.id] ? this.upgrades[upg.id].level : 0;
                if (level > 0 && upg.applyFn) {
                    upg.applyFn(this.stats, level);
                }
            });
        }

        this.weapon.accuracyModifier = 0;
        this.weapon.damage = this.stats.damage.value;
        this.weapon.range = this.stats.range.value;
        this.weapon.chargeTime = this.stats.chargeTime.value;
        this.weapon.penetration = this.stats.penetration.value;

        this.turret.turnSpeed = this.stats.turnSpeed.value;
        this.turret2.turnSpeed = this.stats.turnSpeed.value;
        this.gameSpeed = this.stats.gameSpeed.value;
        this.selectedSpeed = Math.min(this.selectedSpeed, this.gameSpeed);
        this.pointBonus = this.stats.pointBonus.value;
        this.mitigation = this.stats.mitigation.value;
        this.planet.updateMaxHealth(this.stats.maxHealth.value);
        this.planet.moveSpeed = 25 * this.stats.moveSpeedMultiplier.value;

        if (upgradesList) {
            upgradesList.forEach((upg) => {
                if (upg.isAbility && this.abilities && this.abilities[upg.id] && upg.abilityApplyFn) {
                    upg.abilityApplyFn(this.weapon, this.planet);
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
        this.mapNodes = [];
        const numLayers = 50;
        const layerSpacing = 150;
        const xSpacing = 120;

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
    }
}

export const state = new GameState();