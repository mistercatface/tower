import { getEnemyDefinition } from "../../../Entities/EntityRegistry.js";
import { Enemy } from "../../../Entities/Enemy.js";
import { fireRadioTrigger } from "../../../Core/EventSystem.js";
import { isBaseStatUpgrade } from "../../../Progression/Upgrades.js";
import { gridSettings } from "../../../Config/Config.js";
import { getStartGameLayout } from "../../../Games/tower/tutorial/StartGameBuilding.js";

/**
 * @param {import("../compileRunScenes.js").RunSceneConfig} def
 */
export function proximityRadioFightBehavior(def) {
    const config = def.config ?? {};
    const enemyTag = config.enemyTag ?? "isIntroGuard";
    const dialogRadius = config.dialogRadius ?? 52;

    return {
        enter(state) {
            state.startGameIntroActive = true;
            state.startGameGuardsDialogUnlocked = false;
            spawnGuards(state, config, enemyTag);
        },

        tick(state) {
            if (!state.startGameIntroActive || state.startGameIntroTriggered) return;
            if (!state.startGameGuardsDialogUnlocked) return;

            const dist = distanceToNearestTaggedGuard(state, enemyTag);
            if (dist > dialogRadius) return;

            state.startGameIntroTriggered = true;
            fireRadioTrigger(config.dialogRadio, () => activateGuards(state, enemyTag), state);
        },
    };
}

export function unlockProximityFightDialog(state) {
    state.startGameGuardsDialogUnlocked = true;
}

function getLayout(state) {
    const mapNode = state.getStartMapNode();
    if (!mapNode) return null;
    const coords = state.getNodeCombatCoords(mapNode);
    return getStartGameLayout(coords.x, coords.y, gridSettings.cellSize);
}

function spawnGuards(state, config, enemyTag) {
    const layout = getLayout(state);
    if (!layout) return;

    const baseUpgradeDefs = (state.upgradeDefs ?? []).filter(isBaseStatUpgrade);
    for (const guard of config.guards ?? []) {
        const typeConfig = getEnemyDefinition(guard.enemyType);
        if (!typeConfig) continue;

        const pos = layout.spawnSlots?.[guard.spawn];
        if (!pos) continue;

        const enemy = Enemy.spawn(pos.x, pos.y, typeConfig, baseUpgradeDefs);
        enemy.isPassive = true;
        enemy[enemyTag] = true;
        enemy.angle = Math.atan2(layout.guardFaceY - pos.y, layout.guardFaceX - pos.x);
        state.enemies.push(enemy);
    }
}

function activateGuards(state, enemyTag) {
    for (const enemy of state.enemies) {
        if (enemy[enemyTag]) enemy.isPassive = false;
    }
    state.startGameIntroActive = false;
    state.startGameIntroCompleted = true;
}

function distanceToNearestTaggedGuard(state, enemyTag) {
    let nearest = Infinity;
    for (const enemy of state.enemies) {
        if (!enemy[enemyTag] || enemy.isDead) continue;
        const dist = Math.hypot(state.player.x - enemy.x, state.player.y - enemy.y);
        if (dist < nearest) nearest = dist;
    }
    return nearest;
}
