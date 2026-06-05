import { enemyTypes, gridSettings } from "../../../Config/Config.js";
import { getStartGameLayout } from "./StartGameBuilding.js";
import { Enemy } from "../../../Entities/Enemy.js";
import { fireRadioTrigger } from "../../../Core/EventSystem.js";
import { isBaseStatUpgrade } from "../../../Progression/Upgrades.js";

/** Tight range — player must be in the guard room (includes actor radii). */
const GUARD_DIALOG_RADIUS = 52;

const GUARD_TYPES = [
    { enemyType: "fast", spawnIndex: 0 },
    { enemyType: "dodger", spawnIndex: 1 },
];

function getEnemyTypeConfig(typeName) {
    return enemyTypes.find((t) => t.type === typeName);
}

export function shouldRunStartGameIntro(state) {
    return !state.startGameIntroCompleted;
}

export function beginStartGameIntro(state) {
    state.startGameIntroActive = true;
    state.startGameGuardsDialogUnlocked = false;
    spawnStartGameGuards(state);
}

export function unlockStartGameGuardsDialog(state) {
    state.startGameGuardsDialogUnlocked = true;
}

function distanceToNearestIntroGuard(state) {
    let nearest = Infinity;
    for (const enemy of state.enemies) {
        if (!enemy.isIntroGuard || enemy.isDead) continue;
        const dist = Math.hypot(state.player.x - enemy.x, state.player.y - enemy.y);
        if (dist < nearest) nearest = dist;
    }
    return nearest;
}

export function spawnStartGameGuards(state) {
    const coords = state.getNodeCombatCoords(state.getStartMapNode());
    const layout = getStartGameLayout(coords.x, coords.y, gridSettings.cellSize);
    const baseUpgradeDefs = (state.upgradeDefs ?? []).filter(isBaseStatUpgrade);
    for (const { enemyType, spawnIndex } of GUARD_TYPES) {
        const typeConfig = getEnemyTypeConfig(enemyType);
        if (!typeConfig) continue;

        const pos = layout.guardSpawns[spawnIndex];
        if (!pos) continue;

        const enemy = Enemy.spawn(pos.x, pos.y, typeConfig, baseUpgradeDefs);
        enemy.isPassive = true;
        enemy.isIntroGuard = true;
        enemy.angle = Math.atan2(layout.guardFaceY - pos.y, layout.guardFaceX - pos.x);
        state.enemies.push(enemy);
    }
}

export function updateStartGameIntro(state) {
    if (!state.startGameIntroActive || state.startGameIntroTriggered) return;
    if (!state.startGameGuardsDialogUnlocked) return;

    const dist = distanceToNearestIntroGuard(state);
    if (dist > GUARD_DIALOG_RADIUS) return;

    state.startGameIntroTriggered = true;
    fireRadioTrigger("start_game_guards", () => completeStartGameIntro(state), state);
}

export function completeStartGameIntro(state) {
    for (const enemy of state.enemies) {
        if (enemy.isIntroGuard) {
            enemy.isPassive = false;
        }
    }
    state.startGameIntroActive = false;
    state.startGameIntroCompleted = true;
}
