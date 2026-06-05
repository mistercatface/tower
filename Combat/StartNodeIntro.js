import { enemyTypes, gridSettings } from "../Config/Config.js";
import { getStartNodeLayout } from "../Generator/StartNodeBuilding.js";
import { Enemy } from "../Entities/Enemy.js";
import { fireRadioTrigger } from "../Core/EventSystem.js";
import { isBaseStatUpgrade } from "../Progression/Upgrades.js";

/** Tight range — player must be in the guard room (includes actor radii). */
const GUARD_DIALOG_RADIUS = 52;

const GUARD_TYPES = [
    { enemyType: "fast", spawnIndex: 0 },
    { enemyType: "dodger", spawnIndex: 1 },
];

function getEnemyTypeConfig(typeName) {
    return enemyTypes.find((t) => t.type === typeName);
}

export function shouldRunStartNodeIntro(state) {
    const node = state.getCurrentMapNode();
    return node?.id === 0 && !state.startNodeIntroCompleted;
}

export function beginStartNodeIntro(state) {
    state.startNodeIntroActive = true;
    state.startNodeGuardsDialogUnlocked = false;
    spawnStartNodeGuards(state);
}

export function unlockStartNodeGuardsDialog(state) {
    state.startNodeGuardsDialogUnlocked = true;
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

export function spawnStartNodeGuards(state) {
    const node = state.getCurrentMapNode();
    if (!node || node.id !== 0) return;

    const coords = state.getNodeCombatCoords(node);
    const layout = getStartNodeLayout(coords.x, coords.y, gridSettings.cellSize);
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

export function updateStartNodeIntro(state) {
    if (!state.startNodeIntroActive || state.startNodeIntroTriggered) return;
    if (!state.startNodeGuardsDialogUnlocked) return;

    const node = state.getCurrentMapNode();
    if (!node || node.id !== 0) return;

    const dist = distanceToNearestIntroGuard(state);
    if (dist > GUARD_DIALOG_RADIUS) return;

    state.startNodeIntroTriggered = true;
    fireRadioTrigger("start_node_guards", () => completeStartNodeIntro(state), state);
}

export function completeStartNodeIntro(state) {
    for (const enemy of state.enemies) {
        if (enemy.isIntroGuard) {
            enemy.isPassive = false;
        }
    }
    state.startNodeIntroActive = false;
    state.startNodeIntroCompleted = true;
}
