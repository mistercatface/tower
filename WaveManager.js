import { enemyTypes, difficultyCurve, spawnSettings } from "./Config.js";
import { Enemy } from "./Entities/Enemy.js";
import { updateUI } from "./UI.js";
import { ProgressionManager } from "./ProgressionManager.js";

export class WaveManager {
    constructor() {
        this.reset();
    }

    reset() {
        this.wave = 0;
        this.sectorWave = 0;
        this.wavesCompleted = 0;
        this.enemiesToSpawn = 5;
        this.enemiesSpawned = 0;
        this.spawnIntervalId = null;
    }

    startCombat() {
        this.wave++;
        this.sectorWave = 1;
        this.enemiesToSpawn = this.calculateEnemiesToSpawn();
        this.enemiesSpawned = 0;
    }

    advance() {
        this.sectorWave++;
        this.wave++;
        this.enemiesToSpawn = this.calculateEnemiesToSpawn();
        this.enemiesSpawned = 0;
    }

    completeWave(totalWavesInSector) {
        this.wavesCompleted++;
        if (this.sectorWave < totalWavesInSector) {
            this.advance();
            return false;
        }
        return true;
    }

    calculateEnemiesToSpawn() {
        if (this.wave % 10 === 0) {
            return 1;
        } else if (this.wave % 10 === 1 && this.wave > 1) {
            return 10 + this.wave * 6;
        } else {
            if (this.wave === 1) return 10;
            return this.enemiesToSpawn + 8 + Math.floor(this.wave / 5);
        }
    }

    calculateSpawnPosition(state, side, pos) {
        const dist = state.spawnRadius;
        let x, y;

        if (side === 0) {
            x = state.planet.x + pos;
            y = state.planet.y - dist;
        } else if (side === 1) {
            x = state.planet.x + dist;
            y = state.planet.y + pos;
        } else if (side === 2) {
            x = state.planet.x + pos;
            y = state.planet.y + dist;
        } else {
            x = state.planet.x - dist;
            y = state.planet.y + pos;
        }

        if (state.gridSystem) {
            const grid = state.gridSystem;
            const gridPos = grid.worldToGrid(x, y);
            let targetCol = Math.max(0, Math.min(grid.cols - 1, gridPos.col));
            let targetRow = Math.max(0, Math.min(grid.rows - 1, gridPos.row));

            if (grid.grid[targetRow * grid.cols + targetCol] !== 0) {
                let found = false;
                for (let radius = 1; radius <= 5; radius++) {
                    for (let r = -radius; r <= radius; r++) {
                        for (let c = -radius; c <= radius; c++) {
                            const nr = targetRow + r;
                            const nc = targetCol + c;
                            if (nr >= 0 && nr < grid.rows && nc >= 0 && nc < grid.cols) {
                                if (grid.grid[nr * grid.cols + nc] === 0) {
                                    targetRow = nr;
                                    targetCol = nc;
                                    found = true;
                                    break;
                                }
                            }
                        }
                        if (found) break;
                    }
                    if (found) break;
                }
            }

            x = targetCol * grid.cellSize + grid.centerX - grid.offsetX + grid.cellSize / 2;
            y = targetRow * grid.cellSize + grid.centerY - grid.offsetY + grid.cellSize / 2;
        }

        return { x, y };
    }

    spawnGroup(state, enemyType, count, spacing = 40) {
        const dist = state.spawnRadius;
        
        let scaledHealth = Math.max(1, Math.floor(enemyType.baseHealth * Math.pow(difficultyCurve.healthMultiplier, this.wave - 1)));
        if (enemyType.maxHealth !== undefined) {
            scaledHealth = Math.min(enemyType.maxHealth, scaledHealth);
        }
        const scaledSpeed = enemyType.baseSpeed * Math.pow(difficultyCurve.speedMultiplier, this.wave - 1);
        const scaledReward = Math.max(1, Math.floor(enemyType.baseHealth * Math.pow(difficultyCurve.rewardMultiplier, this.wave - 1)));

        let enemiesRemaining = count;
        while (enemiesRemaining > 0) {
            const subGroupSize = Math.min(enemiesRemaining, Math.floor(Math.random() * 6) + 5);
            enemiesRemaining -= subGroupSize;

            const side = Math.floor(Math.random() * 4);
            const basePos = (Math.random() * 2 - 1) * (dist - (subGroupSize * spacing) / 2);

            for (let i = 0; i < subGroupSize; i++) {
                const pos = basePos + i * spacing;
                const { x, y } = this.calculateSpawnPosition(state, side, pos);
                state.enemies.push(new Enemy(x, y, enemyType.radius, scaledSpeed, scaledHealth, enemyType.color, scaledReward, enemyType.type, enemyType.attackType, enemyType.canDodge));
            }
        }

        return count;
    }

    spawnEnemy(state) {
        let selectedType;

        if (this.wave % 10 === 0) {
            selectedType = enemyTypes.find((e) => e.type === "boss");
        } else {
            let availableTypes = enemyTypes.filter((e) => e.type !== "boss" && (e.minLevel === undefined || state.level >= e.minLevel));

            if (availableTypes.length === 0) {
                availableTypes.push(enemyTypes.find((e) => e.type === "standard"));
            }

            const totalWeight = availableTypes.reduce((sum, e) => sum + e.weight, 0);
            let rand = Math.random() * totalWeight;
            selectedType = availableTypes[0];

            for (const type of availableTypes) {
                if (rand < type.weight) {
                    selectedType = type;
                    break;
                }
                rand -= type.weight;
            }
        }

        if (selectedType.spawnType === "group") {
            const groupSize = selectedType.groupSettings.baseGroupSize + Math.floor(this.wave * selectedType.groupSettings.growthPerWave);
            return this.spawnGroup(state, selectedType, groupSize);
        } else {
            const baseSimultaneous = 3 + Math.floor(this.wave / 2);
            const simCount = Math.min(baseSimultaneous, this.enemiesToSpawn - this.enemiesSpawned);

            for (let i = 0; i < simCount; i++) {
                const dist = state.spawnRadius;
                const side = Math.floor(Math.random() * 4);
                const pos = (Math.random() * 2 - 1) * dist;
                const { x, y } = this.calculateSpawnPosition(state, side, pos);

                let scaledHealth = Math.max(1, Math.floor(selectedType.baseHealth * Math.pow(difficultyCurve.healthMultiplier, this.wave - 1)));
                if (selectedType.maxHealth !== undefined) {
                    scaledHealth = Math.min(selectedType.maxHealth, scaledHealth);
                }
                const scaledSpeed = selectedType.baseSpeed * Math.pow(difficultyCurve.speedMultiplier, this.wave - 1);
                const scaledReward = Math.max(1, Math.floor(selectedType.baseHealth * Math.pow(difficultyCurve.rewardMultiplier, this.wave - 1)));

                state.enemies.push(new Enemy(x, y, selectedType.radius, scaledSpeed, scaledHealth, selectedType.color, scaledReward, selectedType.type, selectedType.attackType, selectedType.canDodge));
            }

            return simCount;
        }
    }

    manageSpawning(dt, state, upgrades, viewport) {
        if (state.phase === "map" || state.phase === "reward" || state.isTransitioning) return;

        if (this.enemiesSpawned < this.enemiesToSpawn && !this.spawnIntervalId) {
            const currentSpawnDelay = Math.max(spawnSettings.minSpawnDelay, spawnSettings.baseSpawnDelay - this.wave * spawnSettings.delayReductionPerWave);

            this.spawnIntervalId = state.scheduler.schedule(currentSpawnDelay, () => {
                if (this.enemiesSpawned < this.enemiesToSpawn) {
                    const count = this.spawnEnemy(state);
                    this.enemiesSpawned += count;
                }

                if (this.enemiesSpawned >= this.enemiesToSpawn) {
                    state.scheduler.cancel(this.spawnIntervalId);
                    this.spawnIntervalId = null;
                }
            }, true);
        }

        const aliveEnemies = state.enemies.filter(e => !e.isDead).length;
        if (this.enemiesSpawned >= this.enemiesToSpawn && aliveEnemies === 0) {
            updateUI(state, upgrades);
            state.isTransitioning = true;
            state.scheduler.schedule(1500, () => {
                state.isTransitioning = false;
                ProgressionManager.handleWaveCompletion(state, upgrades, viewport);
            });
        }
    }
}