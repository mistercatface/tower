import { getEnemyDefinition } from "../../../../Entities/EntityRegistry.js";
import { Enemy } from "../../../../Entities/Enemy.js";
import { fireRadioTrigger } from "../../../../Libraries/Radio/radioEvents.js";
import { isBaseStatUpgrade } from "../../progression/Upgrades.js";
import { ensureRunScene, getRunSceneIntro } from "../runSceneState.js";
/**
 * @param {import("../compileRunScenes.js").RunSceneConfig} def
 * @param {import("../runScenePorts.js").RunScenePorts} ports
 */
export function proximityRadioFightBehavior(def, ports) {
    const config = def.config ?? {};
    const enemyTag = config.enemyTag ?? "isIntroGuard";
    const dialogRadius = config.dialogRadius ?? 52;
    return {
        enter(state) {
            const intro = getRunSceneIntro(state);
            intro.active = true;
            if (ensureRunScene(state).opening?.completed) intro.dialogUnlocked = true;
            spawnGuards(state, config, enemyTag, ports);
        },
        tick(state) {
            const intro = getRunSceneIntro(state);
            if (!intro.active || intro.triggered) return;
            if (!intro.dialogUnlocked) return;
            const dist = distanceToNearestTaggedGuard(state, enemyTag);
            if (dist > dialogRadius) return;
            intro.triggered = true;
            fireRadioTrigger(config.dialogRadio, () => activateGuards(state, enemyTag), state);
        },
    };
}
export function unlockProximityFightDialog(state) {
    getRunSceneIntro(state).dialogUnlocked = true;
}
function spawnGuards(state, config, enemyTag, ports) {
    const layout = ports.getLayout(state);
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
    const intro = getRunSceneIntro(state);
    for (const enemy of state.enemies) if (enemy[enemyTag]) enemy.isPassive = false;
    intro.active = false;
    intro.completed = true;
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
