import { spawnFloatingText, events, Events, requestUiUpdate, requestProgressDirty, requestProgressSave, requestGamePause, requestGameResume, showSectorClearedModal } from "../Core/EventSystem.js";
import { StatsManager } from "./StatsManager.js";

export class ProgressionManager {
    static processEnemyKillRewards(enemy, state, upgrades) {
        const pointsReward = enemy.reward * 10 + state.runStats.pointBonus.value;
        let xpGain = 5;

        upgrades.forEach((upg) => {
            if (state.player.upgrades[upg.id] && state.player.upgrades[upg.id].level > 0 && upg.onEnemyKilled) {
                xpGain = upg.onEnemyKilled(state, enemy, xpGain);
            }
        });

        state.kills++;
        state.score += pointsReward;

        StatsManager.grantXP(state, xpGain);

        spawnFloatingText({ x: enemy.x, y: enemy.y, text: `+${pointsReward} Points`, color: "#FFF" });
        spawnFloatingText({ x: enemy.x, y: enemy.y - 30, text: `+${xpGain} XP`, color: "#4CAF50" });
    }

    static updatePickups(state, dt) {
        for (let i = state.pickups.length - 1; i >= 0; i--) {
            const p = state.pickups[i];
            p.update(dt, state);
            if (p.isDead) {
                state.pickups.splice(i, 1);
            }
        }
    }

    static updateAbilities(state, dt, upgrades) {
        let externalSpeedMod = 1.0;
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
                }
            });

        return { externalSpeedMod, isDiving };
    }

    static applyUpgradeChoice(state, upgrades, choice, pointsAmount, setBaseLevel) {
        if (choice === "take_points") {
            state.score += pointsAmount;
            spawnFloatingText({ x: state.player.x, y: state.player.y - 60, text: `+${pointsAmount} Pts`, color: "#FFEB3B" });
        } else {
            const upg = upgrades.find((u) => u.id === choice);
            if (upg.replaces && upg.replaces.length > 0) {
                upg.replaces.forEach((repId) => {
                    if (state.player.upgrades[repId]) {
                        state.player.upgrades[repId].level = 0;
                        state.player.upgrades[repId].baseLevel = 0;
                    }
                    state.abilities[repId] = false;
                });
            }
            state.player.upgrades[choice].level = 1;
            if (setBaseLevel) {
                state.player.upgrades[choice].baseLevel = 1;
            }
            state.abilities[choice] = true;
            if (state.discoveredAbilities) {
                state.discoveredAbilities.add(choice);
            }
            if (upg.onPurchase) upg.onPurchase(state);
        }
    }

    static getValidAbilities(state, upgrades) {
        return upgrades.filter((u) => {
            const uState = state.player.upgrades[u.id];
            if (u.category !== "abilities" || uState.level > 0) return false;
            if (u.requires && u.requires.some((req) => !state.player.upgrades[req] || state.player.upgrades[req].level === 0)) return false;
            if (u.minPlayerLevel && state.level < u.minPlayerLevel) return false;
            if (upgrades.some((activeUpg) => state.player.upgrades[activeUpg.id].level > 0 && activeUpg.replaces && activeUpg.replaces.includes(u.id))) return false;
            return true;
        });
    }

    static promptChoice(title, description, choices, customUpgrades, onPick) {
        requestGamePause("modal");
        events.emit(Events.UI_SHOW_UPGRADE_CHOICE, {
            title,
            description,
            choices,
            upgrades: customUpgrades,
            onPick: (pickedId) => {
                onPick(pickedId);
                requestGameResume("modal");
                requestUiUpdate();
            },
        });
    }

    static promptAbilitySelection(state, upgrades, title, description, choices, isNewRun) {
        const pointsAmount = 100 + 100 * state.level;
        if (state.discoveredAbilities) {
            choices.forEach((choiceId) => {
                if (choiceId !== "take_points") {
                    state.discoveredAbilities.add(choiceId);
                }
            });
            requestProgressDirty();
        }

        choices.push("take_points");

        const customUpgrades = [...upgrades, { id: "take_points", name: "Take Points", description: `Gain ${pointsAmount} Points` }];

        this.promptChoice(title, description, choices, customUpgrades, (pickedId) => {
            this.applyUpgradeChoice(state, upgrades, pickedId, pointsAmount, !isNewRun);
            if (isNewRun) requestProgressSave();
            StatsManager.recalculateStats(state, upgrades);
        });
    }

    static getValidPerks(state, upgrades) {
        return upgrades.filter((u) => {
            if (!u.isPerk) return false;
            if (u.minPlayerLevel && state.level < u.minPlayerLevel) return false;
            const uState = state.player.upgrades[u.id];
            if (uState && uState.baseLevel >= u.maxLevel) return false;
            return true;
        });
    }

    static promptPerkSelection(state, upgrades, title, description, choices) {
        this.promptChoice(title, description, choices, [...upgrades], (pickedId) => {
            const upg = upgrades.find((u) => u.id === pickedId);
            state.player.upgrades[pickedId].baseLevel = 1;
            state.player.upgrades[pickedId].level = 1;
            requestProgressSave();
            StatsManager.recalculateStats(state, upgrades);
            if (upg.onPurchase) upg.onPurchase(state);
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
        const currentNode = state.getCurrentMapNode();

        const isFinished = state.waveManager.completeWave(currentNode.wavesTotal);
        if (isFinished) {
            if (currentNode && !currentNode.completed) {
                currentNode.completed = true;
                state.fsm.transition("reward");
                upgrades.forEach((upg) => {
                    if (state.player.upgrades[upg.id] && state.player.upgrades[upg.id].level > 0 && upg.onSectorEnd) {
                        upg.onSectorEnd(state);
                    }
                });
                if (currentNode.reward && currentNode.reward.type === "random_permanent_upgrade") {
                    this.awardPermanentUpgrade(state, upgrades, currentNode, viewport);
                } else {
                    this.finalizeSectorClearance(state, upgrades, currentNode, viewport, "Reward: None");
                }
            } else {
                state.fsm.transition("map");
                viewport.snapTo(state.player.x - state.player.x - viewport.x, state.player.y - state.player.y - viewport.y);
                requestUiUpdate();
            }
            return;
        }
        requestUiUpdate();
    }

    static awardPermanentUpgrade(state, upgrades, currentNode, viewport) {
        let rewardText = "Reward: None";
        const validUpgrades = upgrades.filter((u) => {
            const uState = state.player.upgrades[u.id];
            return uState && uState.baseLevel < u.maxLevel && u.category !== "abilities" && u.category !== "perk";
        });
        if (validUpgrades.length > 0) {
            const pickedUpg = validUpgrades[Math.floor(Math.random() * validUpgrades.length)];
            const uState = state.player.upgrades[pickedUpg.id];
            uState.baseLevel++;
            uState.level = Math.min(pickedUpg.maxLevel, uState.level + 1);
            requestProgressSave();
            StatsManager.recalculateStats(state, upgrades);
            if (pickedUpg.onPurchase) pickedUpg.onPurchase(state);
            rewardText = `Reward: Permanent ${pickedUpg.name} Upgrade!`;
        }
        this.finalizeSectorClearance(state, upgrades, currentNode, viewport, rewardText);
    }

    static finalizeSectorClearance(state, upgrades, currentNode, viewport, rewardText) {
        showSectorClearedModal(currentNode, rewardText);
    }
}