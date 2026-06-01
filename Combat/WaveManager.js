import { spawnSettings, timingSettings, waveSettings } from "../Config/Config.js";
import { canRunWaveSpawning } from "../GameState/GamePhase.js";
import { Enemy } from "../Entities/Enemy.js";
import { requestUiUpdate, emitCombatWaveCleared } from "../Core/EventSystem.js";
import { isBaseStatUpgrade } from "../Progression/Upgrades.js";
import {
    getBossPod,
    getEnemyType,
    getPodSize,
    selectSpawnPod,
} from "./SpawnPods.js";

export class WaveManager {
    constructor() {
        this.reset();
    }

    reset() {
        this.wave = 0;
        this.sectorWave = 0;
        this.wavesCompleted = 0;
        this.enemiesToSpawn = waveSettings.firstWaveEnemyCount;
        this.enemiesSpawned = 0;
        this.spawnIntervalId = null;
        this.waveClearScheduled = false;
    }

    startCombat() {
        this.wave++;
        this.sectorWave = 1;
        this.enemiesToSpawn = this.calculateEnemiesToSpawn();
        this.enemiesSpawned = 0;
        this.waveClearScheduled = false;
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
        const {
            bossWaveInterval,
            firstWaveEnemyCount,
            postBossBaseCount,
            earlyWaveCap,
            postBossMultiplierEarly,
            postBossMultiplierLate,
            earlyWaveGrowth,
            lateWaveGrowthBase,
            lateWaveGrowthDivisor,
        } = waveSettings;

        if (this.wave % bossWaveInterval === 0) {
            return 1;
        } else if (this.wave % bossWaveInterval === 1 && this.wave > 1) {
            const multiplier = this.wave <= earlyWaveCap ? postBossMultiplierEarly : postBossMultiplierLate;
            return postBossBaseCount + this.wave * multiplier;
        } else {
            if (this.wave === 1) return firstWaveEnemyCount;
            const growth = this.wave <= earlyWaveCap ? earlyWaveGrowth : (lateWaveGrowthBase + Math.floor(this.wave / lateWaveGrowthDivisor));
            return this.enemiesToSpawn + growth;
        }
    }

    calculateSpawnPosition(state, side, pos) {
        const dist = state.spawnRadius;
        let x, y;

        if (side === 0) {
            x = state.player.x + pos;
            y = state.player.y - dist;
        } else if (side === 1) {
            x = state.player.x + dist;
            y = state.player.y + pos;
        } else if (side === 2) {
            x = state.player.x + pos;
            y = state.player.y + dist;
        } else {
            x = state.player.x - dist;
            y = state.player.y + pos;
        }

        if (state.flowFieldGrid) {
            const grid = state.flowFieldGrid;
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

    spawnPod(state, pod, baseUpgradeDefs) {
        const spacing = waveSettings.podSpacing;
        const side = Math.floor(Math.random() * 4);
        const podSize = getPodSize(pod);
        const dist = state.spawnRadius;
        const basePos = (Math.random() * 2 - 1) * (dist - (podSize * spacing) / 2);

        let slot = 0;
        let spawned = 0;

        for (const member of pod.members) {
            const enemyType = getEnemyType(member.type);
            if (!enemyType) continue;

            for (let i = 0; i < member.count; i++) {
                const pos = basePos + slot * spacing;
                const { x, y } = this.calculateSpawnPosition(state, side, pos);
                state.enemies.push(Enemy.spawn(x, y, enemyType, this.wave, baseUpgradeDefs));
                slot++;
                spawned++;
            }
        }

        return spawned;
    }

    spawnEnemy(state, upgrades) {
        const baseUpgradeDefs = upgrades.filter(isBaseStatUpgrade);
        const remaining = this.enemiesToSpawn - this.enemiesSpawned;

        const pod = this.wave % waveSettings.bossWaveInterval === 0
            ? getBossPod()
            : selectSpawnPod(state, remaining);

        return this.spawnPod(state, pod, baseUpgradeDefs);
    }

    manageSpawning(dt, state, upgrades, viewport) {
        if (!canRunWaveSpawning(state)) return;

        if (this.enemiesSpawned < this.enemiesToSpawn && !this.spawnIntervalId) {
            const currentSpawnDelay = Math.max(spawnSettings.minSpawnDelay, spawnSettings.baseSpawnDelay - this.wave * spawnSettings.delayReductionPerWave);

            this.spawnIntervalId = state.scheduler.schedule(currentSpawnDelay, () => {
                if (this.enemiesSpawned < this.enemiesToSpawn) {
                    const count = this.spawnEnemy(state, upgrades);
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
            if (this.waveClearScheduled) return;
            this.waveClearScheduled = true;
            requestUiUpdate();
            state.isTransitioning = true;
            state.scheduler.schedule(timingSettings.sectorCompletedDelay, () => {
                this.waveClearScheduled = false;
                state.isTransitioning = false;
                emitCombatWaveCleared();
            });
        }
    }
}
