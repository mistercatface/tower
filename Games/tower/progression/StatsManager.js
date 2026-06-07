import { perkMilestones, xpForLevel } from "../../../Config/Config.js";
import { createUpgradeLevels, resetUpgradeLevels } from "../../../Entities/CombatantStats.js";
import { spawnFloatingText } from "../../../Core/EventSystem.js";
export class StatsManager {
    static initUpgradesList(state) {
        const upgradeList = state.upgradeDefs ?? [];
        const player = state.player;
        if (Object.keys(player.upgrades).length === 0) {
            player.upgrades = createUpgradeLevels(upgradeList, state.runStats.baseUpgradeCost.value);
            StatsManager.resetUpgradesToDefault(state);
        }
        for (const upg of upgradeList) if (upg.isAbility && !state.abilityTimers[upg.id]) state.abilityTimers[upg.id] = { readyTime: 0, activeUntil: 0, activeId: null, cooldownId: null };
    }
    static resetUpgradesToDefault(state) {
        resetUpgradeLevels(state.player.upgrades);
    }
    static grantXP(state, amount) {
        state.xp += amount;
        let xpNeeded = xpForLevel(state.level);
        while (state.xp >= xpNeeded) {
            state.xp -= xpNeeded;
            state.level++;
            if (perkMilestones.includes(state.level) && !state.claimedPerkMilestones.includes(state.level)) {
                state.pendingPerkPicks.push(state.level);
                state.claimedPerkMilestones.push(state.level);
            }
            state.pendingLevelUps++;
            if (state.level > state.highestLevelReached) state.highestLevelReached = state.level;
            xpNeeded = xpForLevel(state.level);
            spawnFloatingText({ x: state.player.x, y: state.player.y - 40, text: "LEVEL UP", color: "#FFEB3B" });
        }
    }
    static recalculateStats(state) {
        const upgradeDefs = state.upgradeDefs ?? [];
        state.player.recalculate(state, upgradeDefs, (upg) => {
            if (upg.isAbility && !state.abilities[upg.id]) return false;
            return true;
        });
    }
}
