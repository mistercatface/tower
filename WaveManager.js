import { enemyTypes, difficultyCurve, spawnSettings } from "./Config.js";
import { Enemy } from "./Enemy.js";
import { updateUI } from "./UI.js";
import { ProgressionManager } from "./ProgressionManager.js";

export class WaveManager {
    static calculateSpawnPosition(state, side, pos) {
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
            const targetCol = Math.max(0, Math.min(grid.cols - 1, gridPos.col));
            const targetRow = Math.max(0, Math.min(grid.rows - 1, gridPos.row));

            x = targetCol * grid.cellSize + grid.centerX - grid.offsetX + grid.cellSize / 2;
            y = targetRow * grid.cellSize + grid.centerY - grid.offsetY + grid.cellSize / 2;
        }

        return { x, y };
    }

    static spawnGroup(state, enemyType, count, spacing = 40) {
        const dist = state.spawnRadius;
        const side = Math.floor(Math.random() * 4);
        const basePos = (Math.random() * 2 - 1) * (dist - (count * spacing) / 2);

        const scaledHealth = Math.max(1, Math.floor(enemyType.baseHealth * Math.pow(difficultyCurve.healthMultiplier, state.wave - 1)));
        const scaledSpeed = enemyType.baseSpeed * Math.pow(difficultyCurve.speedMultiplier, state.wave - 1);
        const scaledReward = Math.max(1, Math.floor(enemyType.baseHealth * Math.pow(difficultyCurve.rewardMultiplier, state.wave - 1)));

        for (let i = 0; i < count; i++) {
            const pos = basePos + i * spacing;
            const { x, y } = this.calculateSpawnPosition(state, side, pos);
            state.enemies.push(new Enemy(x, y, enemyType.radius, scaledSpeed, scaledHealth, enemyType.color, scaledReward, enemyType.type, enemyType.attackType, enemyType.canDodge));
        }
        return count;
    }

    static spawnEnemy(state) {
        let selectedType;

        if (state.wave % 10 === 0) {
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
            const groupSize = selectedType.groupSettings.baseGroupSize + Math.floor(state.wave * selectedType.groupSettings.growthPerWave);
            return this.spawnGroup(state, selectedType, groupSize);
        } else {
            const dist = state.spawnRadius;
            const side = Math.floor(Math.random() * 4);
            const pos = (Math.random() * 2 - 1) * dist;
            const { x, y } = this.calculateSpawnPosition(state, side, pos);

            const scaledHealth = Math.max(1, Math.floor(selectedType.baseHealth * Math.pow(difficultyCurve.healthMultiplier, state.wave - 1)));
            const scaledSpeed = selectedType.baseSpeed * Math.pow(difficultyCurve.speedMultiplier, state.wave - 1);
            const scaledReward = Math.max(1, Math.floor(selectedType.baseHealth * Math.pow(difficultyCurve.rewardMultiplier, state.wave - 1)));

            state.enemies.push(new Enemy(x, y, selectedType.radius, scaledSpeed, scaledHealth, selectedType.color, scaledReward, selectedType.type, selectedType.attackType, selectedType.canDodge));
            return 1;
        }
    }

    static manageSpawning(dt, state, upgrades, viewport) {
        if (state.phase === "map" || state.phase === "reward" || state.isTransitioning) return;

        if (state.enemiesSpawned < state.enemiesToSpawn && !state.spawnIntervalId) {
            const currentSpawnDelay = Math.max(spawnSettings.minSpawnDelay, spawnSettings.baseSpawnDelay - state.wave * spawnSettings.delayReductionPerWave);
            
            state.spawnIntervalId = state.scheduler.schedule(currentSpawnDelay, () => {
                if (state.enemiesSpawned < state.enemiesToSpawn) {
                    const count = this.spawnEnemy(state);
                    state.enemiesSpawned += count;
                }
                
                if (state.enemiesSpawned >= state.enemiesToSpawn) {
                    state.scheduler.cancel(state.spawnIntervalId);
                    state.spawnIntervalId = null;
                }
            }, true);
        }

        if (state.enemiesSpawned >= state.enemiesToSpawn && state.enemies.length === 0) {
            updateUI(state, upgrades);
            state.isTransitioning = true;
            state.scheduler.schedule(1500, () => {
                state.isTransitioning = false;
                ProgressionManager.handleWaveCompletion(state, upgrades, viewport);
            });
        }
    }
}
