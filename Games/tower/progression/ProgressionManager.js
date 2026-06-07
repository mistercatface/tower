import { spawnFloatingText, events, Events, requestUiUpdate, requestGamePause, requestGameResume } from "../../../Core/EventSystem.js";
import { requestProgressDirty, requestProgressSave } from "./events.js";
import { StatsManager } from "./StatsManager.js";
/** @param {object} state */
function upgradeDefs(state) {
    return state.upgradeDefs ?? [];
}
export class ProgressionManager {
    static processEnemyKillRewards(enemy, state) {
        const pointsReward = enemy.reward * 10 + state.runStats.pointBonus.value;
        let xpGain = 5;
        upgradeDefs(state).forEach((upg) => {
            if (state.player.upgrades[upg.id] && state.player.upgrades[upg.id].level > 0 && upg.onEnemyKilled) xpGain = upg.onEnemyKilled(state, enemy, xpGain);
        });
        state.kills++;
        state.score += pointsReward;
        StatsManager.grantXP(state, xpGain);
        spawnFloatingText({ x: enemy.x, y: enemy.y, text: `+${pointsReward} Points`, color: "#FFF" });
        spawnFloatingText({ x: enemy.x, y: enemy.y - 30, text: `+${xpGain} XP`, color: "#4CAF50" });
    }
    static updatePickups(state, dt, spatialFrame, { resolveWalls = false } = {}) {
        for (let i = state.pickups.length - 1; i >= 0; i--) {
            const p = state.pickups[i];
            p.update(dt, state, spatialFrame, { resolveWalls });
            if (p.isDead) state.pickups.splice(i, 1);
        }
    }
    static updateAbilities(state, dt) {
        let externalSpeedMod = 1.0;
        let isDiving = false;
        upgradeDefs(state)
            .filter((u) => u.isAbility && state.abilities[u.id])
            .forEach((upg) => {
                const timers = state.abilityTimers[upg.id];
                const activeRemaining = state.scheduler.getTimeRemaining(timers.activeId);
                if (activeRemaining > 0) {
                    if (upg.triggerType === "double_tap_move") isDiving = true;
                    if (upg.speedModFn) externalSpeedMod *= upg.speedModFn(activeRemaining, upg.activeDuration);
                }
            });
        return { externalSpeedMod, isDiving };
    }
    static applyUpgradeChoice(state, choice, pointsAmount, setBaseLevel) {
        const defs = upgradeDefs(state);
        if (choice === "take_points") {
            state.score += pointsAmount;
            spawnFloatingText({ x: state.player.x, y: state.player.y - 60, text: `+${pointsAmount} Pts`, color: "#FFEB3B" });
        } else {
            const upg = defs.find((u) => u.id === choice);
            if (upg.replaces && upg.replaces.length > 0)
                upg.replaces.forEach((repId) => {
                    if (state.player.upgrades[repId]) {
                        state.player.upgrades[repId].level = 0;
                        state.player.upgrades[repId].baseLevel = 0;
                    }
                    state.abilities[repId] = false;
                });
            state.player.upgrades[choice].level = 1;
            if (setBaseLevel) state.player.upgrades[choice].baseLevel = 1;
            state.abilities[choice] = true;
            if (state.discoveredAbilities) state.discoveredAbilities.add(choice);
            if (upg.onPurchase) upg.onPurchase(state);
        }
    }
    static getValidAbilities(state) {
        const defs = upgradeDefs(state);
        return defs.filter((u) => {
            const uState = state.player.upgrades[u.id];
            if (u.category !== "abilities" || uState.level > 0) return false;
            if (u.requires && u.requires.some((req) => !state.player.upgrades[req] || state.player.upgrades[req].level === 0)) return false;
            if (u.minPlayerLevel && state.level < u.minPlayerLevel) return false;
            if (defs.some((activeUpg) => state.player.upgrades[activeUpg.id].level > 0 && activeUpg.replaces && activeUpg.replaces.includes(u.id))) return false;
            return true;
        });
    }
    static promptChoice(title, description, choices, choiceDefs, onPick) {
        requestGamePause("modal");
        events.emit(Events.UI_SHOW_UPGRADE_CHOICE, {
            title,
            description,
            choices,
            choiceDefs,
            onPick: (pickedId) => {
                onPick(pickedId);
                requestGameResume("modal");
                requestUiUpdate();
            },
        });
    }
    static promptAbilitySelection(state, title, description, choices, isNewRun) {
        const defs = upgradeDefs(state);
        const pointsAmount = 100 + 100 * state.level;
        if (state.discoveredAbilities) {
            choices.forEach((choiceId) => {
                if (choiceId !== "take_points") state.discoveredAbilities.add(choiceId);
            });
            requestProgressDirty();
        }
        choices.push("take_points");
        const choiceDefs = [...defs, { id: "take_points", name: "Take Points", description: `Gain ${pointsAmount} Points` }];
        this.promptChoice(title, description, choices, choiceDefs, (pickedId) => {
            this.applyUpgradeChoice(state, pickedId, pointsAmount, !isNewRun);
            if (isNewRun) requestProgressSave();
            StatsManager.recalculateStats(state);
        });
    }
    static getValidPerks(state) {
        return upgradeDefs(state).filter((u) => {
            if (!u.isPerk) return false;
            if (u.minPlayerLevel && state.level < u.minPlayerLevel) return false;
            const uState = state.player.upgrades[u.id];
            if (uState && uState.baseLevel >= u.maxLevel) return false;
            return true;
        });
    }
    static promptPerkSelection(state, title, description, choices) {
        const defs = upgradeDefs(state);
        this.promptChoice(title, description, choices, [...defs], (pickedId) => {
            const upg = defs.find((u) => u.id === pickedId);
            state.player.upgrades[pickedId].baseLevel = 1;
            state.player.upgrades[pickedId].level = 1;
            requestProgressSave();
            StatsManager.recalculateStats(state);
            if (upg.onPurchase) upg.onPurchase(state);
        });
    }
    static setupNewRunAbilities(state) {
        const validAbilities = this.getValidAbilities(state);
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
        this.promptAbilitySelection(state, "New Run", "Choose a starting Ability.", choices, true);
    }
    static processLevelUps(state) {
        if (state.isPaused) return;
        if (state.pendingPerkPicks && state.pendingPerkPicks.length > 0) {
            const milestone = state.pendingPerkPicks.shift();
            const validPerks = this.getValidPerks(state);
            const choices = [];
            const numChoices = Math.min(3, validPerks.length);
            const availablePool = [...validPerks];
            for (let i = 0; i < numChoices; i++) {
                const randIdx = Math.floor(Math.random() * availablePool.length);
                choices.push(availablePool[randIdx].id);
                availablePool.splice(randIdx, 1);
            }
            if (choices.length > 0) this.promptPerkSelection(state, "MILESTONE REACHED", `Choose a Perk`, choices);
            return;
        }
        if (state.pendingLevelUps > 0) {
            state.pendingLevelUps--;
            const validUpgrades = this.getValidAbilities(state);
            const choices = [];
            const numChoices = Math.min(3, validUpgrades.length);
            const availablePool = [...validUpgrades];
            for (let i = 0; i < numChoices; i++) {
                const randIdx = Math.floor(Math.random() * availablePool.length);
                choices.push(availablePool[randIdx].id);
                availablePool.splice(randIdx, 1);
            }
            this.promptAbilitySelection(state, "LEVEL UP", "Choose a new ability.", choices, false);
        }
    }
}
