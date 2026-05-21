import { enemyTypes, difficultyCurve } from "./Config.js";
import { Enemy } from "./Enemy.js";
import { showSectorCleared, updateUI } from "./UI.js";
import { saveProgress } from "./Storage.js";

export class WaveManager {
    static spawnEnemy(state) {
        const dist = state.spawnRadius;
        let x, y;

        const side = Math.floor(Math.random() * 4);
        const pos = (Math.random() * 2 - 1) * dist;

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

            x = targetCol * grid.cellSize + grid.centerX - grid.offsetX + grid.cellSize / 2;
            y = targetRow * grid.cellSize + grid.centerY - grid.offsetY + grid.cellSize / 2;
        }

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

        const scaledHealth = Math.max(1, Math.floor(selectedType.baseHealth * Math.pow(difficultyCurve.healthMultiplier, state.wave - 1)));
        const scaledSpeed = selectedType.baseSpeed * Math.pow(difficultyCurve.speedMultiplier, state.wave - 1);
        const scaledReward = Math.max(1, Math.floor(selectedType.baseHealth * Math.pow(difficultyCurve.rewardMultiplier, state.wave - 1)));

        state.enemies.push(new Enemy(x, y, selectedType.radius, scaledSpeed, scaledHealth, selectedType.color, scaledReward, selectedType.type));
    }

    static spawnLineEnemies(state) {
        const numEnemies = 10;
        const dist = state.spawnRadius;
        const side = Math.floor(Math.random() * 4);
        const selectedType = enemyTypes.find((e) => e.type === "standard");
        const scaledHealth = Math.max(1, Math.floor(selectedType.baseHealth * Math.pow(difficultyCurve.healthMultiplier, state.wave - 1)));
        const scaledSpeed = selectedType.baseSpeed * Math.pow(difficultyCurve.speedMultiplier, state.wave - 1);
        const scaledReward = Math.max(1, Math.floor(selectedType.baseHealth * Math.pow(difficultyCurve.rewardMultiplier, state.wave - 1)));

        const spacing = 40;
        const startOffset = -((numEnemies - 1) * spacing) / 2;

        for (let i = 0; i < numEnemies; i++) {
            let x, y;
            const pos = startOffset + i * spacing;

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

                x = targetCol * grid.cellSize + grid.centerX - grid.offsetX + grid.cellSize / 2;
                y = targetRow * grid.cellSize + grid.centerY - grid.offsetY + grid.cellSize / 2;
            }

            state.enemies.push(new Enemy(x, y, selectedType.radius, scaledSpeed, scaledHealth, selectedType.color, scaledReward, selectedType.type));
        }
    }

    static manageSpawning(dt, state, upgrades, viewport) {
        if (state.phase === "map" || state.phase === "reward") return;
        if (state.isTransitioning) {
            state.waveTransitionTimer -= dt;
            if (state.waveTransitionTimer <= 0) {
                state.isTransitioning = false;
                const currentNode = state.mapNodes.find((n) => n.id === state.currentNodeId);
                const advanceWave = () => {
                    state.wavesCompleted++;
                    if (state.sectorWave < currentNode.wavesTotal) {
                        state.sectorWave++;
                        state.wave++;
                        if (state.wave % 10 === 0) {
                            state.enemiesToSpawn = 1;
                        } else if (state.wave % 10 === 1 && state.wave > 1) {
                            state.enemiesToSpawn = 5 + state.wave * 2;
                        } else {
                            if (state.wave === 1) state.enemiesToSpawn = 5;
                            else state.enemiesToSpawn += 3;
                        }
                        state.enemiesSpawned = 0;
                    } else {
                        if (currentNode && !currentNode.completed) {
                            currentNode.completed = true;
                            state.phase = "reward";
                            upgrades.forEach((upg) => {
                                if (state.upgrades[upg.id] && state.upgrades[upg.id].level > 0 && upg.onSectorEnd) {
                                    upg.onSectorEnd(state);
                                }
                            });
                            const finishSector = (rewardText) => {
                                showSectorCleared(currentNode, rewardText, () => {
                                    state.phase = "map";
                                    viewport.snapTo(state.mapPlayerX - state.planet.x - viewport.x, state.mapPlayerY - state.planet.y - viewport.y);
                                    updateUI(state, upgrades);
                                });
                            };
                            if (currentNode.reward && currentNode.reward.type === "random_permanent_upgrade") {
                                let rewardText = "Reward: None";
                                const validUpgrades = upgrades.filter((u) => {
                                    const uState = state.upgrades[u.id];
                                    return uState && uState.baseLevel < u.maxLevel && u.category !== "abilities" && u.category !== "perk";
                                });
                                if (validUpgrades.length > 0) {
                                    const pickedUpg = validUpgrades[Math.floor(Math.random() * validUpgrades.length)];
                                    const uState = state.upgrades[pickedUpg.id];
                                    uState.baseLevel++;
                                    uState.level++;
                                    saveProgress(state);
                                    state.recalculateStats(upgrades);
                                    if (pickedUpg.onPurchase) pickedUpg.onPurchase(state);
                                    rewardText = `Reward: Permanent ${pickedUpg.name} Upgrade!`;
                                }
                                finishSector(rewardText);
                            } else {
                                finishSector();
                            }
                        } else {
                            state.phase = "map";
                            viewport.snapTo(state.planet.x - state.planet.x - viewport.x, state.planet.y - state.planet.y - viewport.y);
                        }
                    }
                    updateUI(state, upgrades);
                };

                advanceWave();
            }
            return;
        }

        state.enemySpawnTimer += dt;
        let currentSpawnDelay = Math.max(300, 1200 - state.wave * 150);

        if (state.enemySpawnTimer > currentSpawnDelay && state.enemiesSpawned < state.enemiesToSpawn) {
            this.spawnEnemy(state);
            state.enemiesSpawned++;
            state.enemySpawnTimer = 0;
        } else if (state.enemiesSpawned >= state.enemiesToSpawn && state.enemies.length === 0) {
            updateUI(state, upgrades);
            state.isTransitioning = true;
            state.waveTransitionTimer = 1500;
        }
    }
}
