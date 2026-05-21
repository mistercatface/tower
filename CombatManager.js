import { FloatingText } from "./FloatingText.js";
import { saveProgress } from "./Storage.js";
import { updateUI } from "./UI.js";
import { perkMilestones } from "./Config.js";

export class CombatManager {
    static handlePlanetHit(damage, state) {
        const mitigatedAmount = damage * state.mitigation;
        const finalDamage = damage - mitigatedAmount;
        state.planet.takeDamage(finalDamage);
        FloatingText.spawn(state, state.planet.x, state.planet.y - 20, `-${finalDamage.toFixed(1)}`, "#F44336");
        if (mitigatedAmount > 0) FloatingText.spawn(state, state.planet.x, state.planet.y + 20, `Mitigated ${mitigatedAmount.toFixed(1)}`, "#03A9F4");
    }

    static handleWallHit(wall, segment, damage, state) {
        segment.health -= damage;
        if (segment.health <= 0 && !segment.isDead) {
            segment.isDead = true;
            state.gridSystem.rebuild(state.walls, state.planet.x, state.planet.y);
        }
    }

    static handleEnemyHit(enemy, baseDamage, state, upgrades) {
        enemy.health -= baseDamage;
        if (enemy.health <= 0 && !enemy.isDead) {
            enemy.isDead = true;
            const pointsReward = enemy.reward * 10 + state.pointBonus;
            let xpGain = 5;
            upgrades.forEach((upg) => {
                if (state.upgrades[upg.id] && state.upgrades[upg.id].level > 0 && upg.onEnemyKilled) {
                    xpGain = upg.onEnemyKilled(state, enemy, xpGain);
                }
            });
            state.kills++;
            state.score += pointsReward;
            state.xp += xpGain;
            let xpNeeded = Math.floor(25 * Math.pow(1.5, state.level));
            while (state.xp >= xpNeeded) {
                state.xp -= xpNeeded;
                state.level++;
                if (perkMilestones.includes(state.level)) {
                    state.pendingPerkPicks.push(state.level);
                }
                state.pendingLevelUps++;
                if (state.level > state.highestLevelReached) state.highestLevelReached = state.level;
                xpNeeded = Math.floor(25 * Math.pow(1.5, state.level));
                FloatingText.spawn(state, state.planet.x, state.planet.y - 40, "LEVEL UP", "#FFEB3B");
            }
            FloatingText.spawn(state, enemy.x, enemy.y, `+${pointsReward} Points`, "#FFF");
            FloatingText.spawn(state, enemy.x, enemy.y - 30, `+${xpGain} XP`, "#4CAF50");
        } 
        saveProgress(state);
        updateUI(state, upgrades);
    }
}