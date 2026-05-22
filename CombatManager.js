import { FloatingText } from "./FloatingText.js";
import { saveProgress } from "./Storage.js";
import { updateUI } from "./UI.js";
import { ProgressionManager } from "./ProgressionManager.js";

export class CombatManager {
    static handlePlanetHit(damage, state) {
        const mitigatedAmount = damage * state.mitigation;
        const finalDamage = damage - mitigatedAmount;
        state.planet.takeDamage(finalDamage);
        FloatingText.spawn(state, state.planet.x, state.planet.y - 20, `-${finalDamage.toFixed(1)}`, "#F44336");
        if (mitigatedAmount > 0) FloatingText.spawn(state, state.planet.x, state.planet.y + 20, `Mitigated ${mitigatedAmount.toFixed(1)}`, "#03A9F4");
    }

    static handleWallHit(segment, damage, state, renderer) {
        segment.health -= damage;
        renderer.chunkManager.dirtySegments.add(segment);
        if (segment.health <= 0 && !segment.isDead) {
            segment.isDead = true;
            state.gridSystem.rebuild(state.walls, state.planet.x, state.planet.y);
        }
    }

    static handleEnemyHit(enemy, baseDamage, state, upgrades) {
        enemy.health -= baseDamage;
        if (enemy.health <= 0 && !enemy.isDead) {
            enemy.isDead = true;
            ProgressionManager.processEnemyKillRewards(enemy, state, upgrades);
        } 
        saveProgress(state);
        updateUI(state, upgrades);
    }
}