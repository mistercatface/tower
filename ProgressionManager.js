import { FloatingText } from "./FloatingText.js";
import { saveProgress } from "./Storage.js";
import { showUpgradeChoice, showSectorCleared, updateUI } from "./UI.js";

export class ProgressionManager {
    static processEnemyKillRewards(enemy, state, upgrades) {
        const pointsReward = enemy.reward * 10 + state.pointBonus;
        let xpGain = 5;

        upgrades.forEach((upg) => {
            if (state.upgrades[upg.id] && state.upgrades[upg.id].level > 0 && upg.onEnemyKilled) {
                xpGain = upg.onEnemyKilled(state, enemy, xpGain);
            }
        });

        state.kills++;
        state.score += pointsReward;

        state.grantXP(xpGain);

        FloatingText.spawn(state, enemy.x, enemy.y, `+${pointsReward} Points`, "#FFF");
        FloatingText.spawn(state, enemy.x, enemy.y - 30, `+${xpGain} XP`, "#4CAF50");
    }

    static updatePickups(state, dt, upgrades) {
        for (let i = state.pickups.length - 1; i >= 0; i--) {
            const p = state.pickups[i];
            p.update(dt);

            if (p.isDead) {
                state.pickups.splice(i, 1);
                continue;
            }

            const dist = Math.hypot(p.x - state.planet.x, p.y - state.planet.y);
            if (dist < state.planet.radius + p.radius) {
                if (p.strategy && p.strategy.onCollect) {
                    const result = p.strategy.onCollect(state, p, upgrades);
                    if (result) {
                        if (result.type === "coin") {
                            if (result.unlockedLaser) {
                                updateUI(state, upgrades);
                                FloatingText.spawn(state, p.x, p.y - 20, "LASER UNLOCKED", "#00BCD4");
                            }
                            saveProgress(state);
                        } else if (result.type === "eyeball") {
                            FloatingText.spawn(state, p.x, p.y, "EYEBALL", "#FFFFFF");
                        }
                    }
                }
            }
        }
    }

    static updateAbilities(state, dt, upgrades) {
        let externalSpeedMod = 1.0;
        let blocksTargeting = false;
        let isDiving = false;

        upgrades
            .filter((u) => u.isAbility && state.abilities[u.id])
            .forEach((upg) => {
                const timers = state.abilityTimers[upg.id];
                const activeRemaining = state.scheduler.getTimeRemaining(timers.activeId);

                if (activeRemaining > 0) {
                    if (upg.triggerType === "double_tap_move") {
                        isDiving = true;
                    }
                    if (upg.speedModFn) {
                        externalSpeedMod *= upg.speedModFn(activeRemaining, upg.activeDuration);
                    }
                    if (upg.blocksTargeting) {
                        blocksTargeting = true;
                    }
                }
            });

        return { externalSpeedMod, blocksTargeting, isDiving };
    }

    static applyUpgradeChoice(state, upgrades, choice, pointsAmount, setBaseLevel) {
        if (choice === "take_points") {
            state.score += pointsAmount;
            FloatingText.spawn(state, state.planet.x, state.planet.y - 60, `+${pointsAmount} Pts`, "#FFEB3B");
        } else {
            const upg = upgrades.find((u) => u.id === choice);
            if (upg.replaces && upg.replaces.length > 0) {
                upg.replaces.forEach((repId) => {
                    if (state.upgrades[repId]) {
                        state.upgrades[repId].level = 0;
                        state.upgrades[repId].baseLevel = 0;
                    }
                    state.abilities[repId] = false;
                });
            }
            state.upgrades[choice].level = 1;
            if (setBaseLevel) {
                state.upgrades[choice].baseLevel = 1;
            }
            state.abilities[choice] = true;
            if (upg.onPurchase) upg.onPurchase(state);
        }
    }

    static getValidAbilities(state, upgrades) {
        return upgrades.filter((u) => {
            if (u.id === "Laser") return false;
            const uState = state.upgrades[u.id];
            if (u.category !== "abilities" || uState.level > 0) return false;
            if (u.requires && u.requires.some((req) => !state.upgrades[req] || state.upgrades[req].level === 0)) return false;
            if (u.minPlayerLevel && state.level < u.minPlayerLevel) return false;
            if (upgrades.some((activeUpg) => state.upgrades[activeUpg.id].level > 0 && activeUpg.replaces && activeUpg.replaces.includes(u.id))) return false;
            return true;
        });
    }

    static promptAbilitySelection(state, upgrades, title, description, choices, isNewRun) {
        const pointsAmount = 100 + 100 * state.level;
        choices.push("take_points");

        const customUpgrades = [...upgrades, { id: "take_points", name: "Take Points", description: `Gain ${pointsAmount} Points` }];

        const previousPauseState = state.isPaused;
        state.isPaused = true;

        showUpgradeChoice(title, description, choices, customUpgrades, (pickedId) => {
            this.applyUpgradeChoice(state, upgrades, pickedId, pointsAmount, !isNewRun);
            if (isNewRun) saveProgress(state);
            state.recalculateStats(upgrades);
            state.isPaused = previousPauseState;
            updateUI(state, upgrades);
        });
    }

    static getValidPerks(state, upgrades) {
        return upgrades.filter((u) => {
            if (!u.isPerk) return false;
            if (u.minPlayerLevel && state.level < u.minPlayerLevel) return false;
            const uState = state.upgrades[u.id];
            if (uState && uState.baseLevel >= u.maxLevel) return false;
            return true;
        });
    }

    static promptPerkSelection(state, upgrades, title, description, choices) {
        const customUpgrades = [...upgrades];
        const previousPauseState = state.isPaused;
        state.isPaused = true;

        showUpgradeChoice(title, description, choices, customUpgrades, (pickedId) => {
            const upg = upgrades.find((u) => u.id === pickedId);
            state.upgrades[pickedId].baseLevel = 1;
            state.upgrades[pickedId].level = 1;
            saveProgress(state);
            state.recalculateStats(upgrades);
            if (upg.onPurchase) upg.onPurchase(state);
            state.isPaused = previousPauseState;
            updateUI(state, upgrades);
        });
    }

    static setupNewRunAbilities(state, upgrades) {
        const validAbilities = this.getValidAbilities(state, upgrades);
        const choices = [];
        const availablePool = [...validAbilities];
        const steadyWeaponIdx = availablePool.findIndex((u) => u.id === "SteadyWeapon");
        if (steadyWeaponIdx !== -1) {
            choices.push("SteadyWeapon");
            availablePool.splice(steadyWeaponIdx, 1);
        }
        const numRemainingChoices = Math.max(0, Math.min(3 - choices.length, availablePool.length));
        for (let i = 0; i < numRemainingChoices; i++) {
            const randIdx = Math.floor(Math.random() * availablePool.length);
            choices.push(availablePool[randIdx].id);
            availablePool.splice(randIdx, 1);
        }
        this.promptAbilitySelection(state, upgrades, "New Run", "Choose a starting Ability.", choices, true);
    }

    static processLevelUps(state, upgrades) {
        if (state.isPaused) return;

        if (state.pendingPerkPicks && state.pendingPerkPicks.length > 0) {
            const milestone = state.pendingPerkPicks.shift();
            const validPerks = this.getValidPerks(state, upgrades);

            const choices = [];
            const numChoices = Math.min(3, validPerks.length);
            const availablePool = [...validPerks];

            for (let i = 0; i < numChoices; i++) {
                const randIdx = Math.floor(Math.random() * availablePool.length);
                choices.push(availablePool[randIdx].id);
                availablePool.splice(randIdx, 1);
            }

            if (choices.length > 0) {
                this.promptPerkSelection(state, upgrades, "MILESTONE REACHED", `Choose a Perk`, choices);
            }
            return;
        }

        if (state.pendingLevelUps > 0) {
            state.pendingLevelUps--;

            const validUpgrades = this.getValidAbilities(state, upgrades);

            const choices = [];
            const numChoices = Math.min(3, validUpgrades.length);
            const availablePool = [...validUpgrades];

            for (let i = 0; i < numChoices; i++) {
                const randIdx = Math.floor(Math.random() * availablePool.length);
                choices.push(availablePool[randIdx].id);
                availablePool.splice(randIdx, 1);
            }

            this.promptAbilitySelection(state, upgrades, "LEVEL UP", "Choose a new ability.", choices, false);
        }
    }

    static handleWaveCompletion(state, upgrades, viewport) {
        const currentNode = state.mapNodes.find((n) => n.id === state.currentNodeId);

        const isFinished = state.waveManager.completeWave(currentNode.wavesTotal);
        if (isFinished) {
            if (currentNode && !currentNode.completed) {
                currentNode.completed = true;
                state.enterRewardPhase();
                upgrades.forEach((upg) => {
                    if (state.upgrades[upg.id] && state.upgrades[upg.id].level > 0 && upg.onSectorEnd) {
                        upg.onSectorEnd(state);
                    }
                });
                if (currentNode.reward && currentNode.reward.type === "random_permanent_upgrade") {
                    this.awardPermanentUpgrade(state, upgrades, currentNode, viewport);
                } else {
                    this.finalizeSectorClearance(state, upgrades, currentNode, viewport, "Reward: None");
                }
            } else {
                state.enterMapPhase();
                viewport.snapTo(state.planet.x - state.planet.x - viewport.x, state.planet.y - state.planet.y - viewport.y);
                updateUI(state, upgrades);
            }
            return;
        }
        updateUI(state, upgrades);
    }

    static awardPermanentUpgrade(state, upgrades, currentNode, viewport) {
        let rewardText = "Reward: None";
        const validUpgrades = upgrades.filter((u) => {
            const uState = state.upgrades[u.id];
            return uState && uState.baseLevel < u.maxLevel && u.category !== "abilities" && u.category !== "perk";
        });
        if (validUpgrades.length > 0) {
            const pickedUpg = validUpgrades[Math.floor(Math.random() * validUpgrades.length)];
            const uState = state.upgrades[pickedUpg.id];
            uState.baseLevel++;
            uState.level = Math.min(pickedUpg.maxLevel, uState.level + 1);
            saveProgress(state);
            state.recalculateStats(upgrades);
            if (pickedUpg.onPurchase) pickedUpg.onPurchase(state);
            rewardText = `Reward: Permanent ${pickedUpg.name} Upgrade!`;
        }
        this.finalizeSectorClearance(state, upgrades, currentNode, viewport, rewardText);
    }

    static finalizeSectorClearance(state, upgrades, currentNode, viewport, rewardText) {
        showSectorCleared(currentNode, rewardText, () => {
            state.enterMapPhase();
            viewport.snapTo(state.mapPlayerX - state.planet.x - viewport.x, state.mapPlayerY - state.planet.y - viewport.y);
            updateUI(state, upgrades);
        });
    }
}