import { enemyTypes, gridSettings } from "../Config/Config.js";
import { getStartNodeLayout } from "../Generator/StartNodeBuilding.js";
import { Enemy } from "../Entities/Enemy.js";
import { fireRadioTrigger } from "../Core/EventSystem.js";
import { isBaseStatUpgrade } from "../Progression/Upgrades.js";

const INTRO_TRIGGER_RADIUS = 200;

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
    spawnStartNodeGuards(state);
}

export function spawnStartNodeGuards(state) {
    const node = state.getCurrentMapNode();
    if (!node || node.id !== 0) return;

    const coords = state.getNodeCombatCoords(node);
    const layout = getStartNodeLayout(coords.x, coords.y, gridSettings.cellSize);
    const baseUpgradeDefs = (state.upgradeDefs ?? []).filter(isBaseStatUpgrade);
    const wave = Math.max(1, state.waveManager.wave);

    for (const { enemyType, spawnIndex } of GUARD_TYPES) {
        const typeConfig = getEnemyTypeConfig(enemyType);
        if (!typeConfig) continue;

        const pos = layout.guardSpawns[spawnIndex];
        if (!pos) continue;

        const enemy = Enemy.spawn(pos.x, pos.y, typeConfig, wave, baseUpgradeDefs);
        enemy.isPassive = true;
        enemy.isIntroGuard = true;
        enemy.angle = Math.atan2(layout.spawnY - pos.y, layout.spawnX - pos.x);
        state.enemies.push(enemy);
    }
}

export function updateStartNodeIntro(state) {
    if (!state.startNodeIntroActive || state.startNodeIntroTriggered) return;

    const node = state.getCurrentMapNode();
    if (!node || node.id !== 0) return;

    const coords = state.getNodeCombatCoords(node);
    const layout = getStartNodeLayout(coords.x, coords.y, gridSettings.cellSize);
    const dist = Math.hypot(
        state.player.x - layout.introTriggerX,
        state.player.y - layout.introTriggerY,
    );

    if (dist > INTRO_TRIGGER_RADIUS) return;

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
