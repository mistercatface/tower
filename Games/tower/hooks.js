import { isInspector } from "../../GameState/GamePhase.js";
import { ProgressionManager } from "../../Progression/ProgressionManager.js";
import { unlockProximityFightDialog } from "../../Libraries/RunScene/behaviors/proximityRadioFight.js";
import { isRadioDialogActive as isTowerRadioDialogActive } from "./wireRadio.js";
import {
    findInspectCollectPickup,
    getInspectCollectMissionBanner,
    handleInspectCollectClose,
    handleInspectCollectOpen,
    isInspectCollectActive,
} from "../../Libraries/RunScene/behaviors/inspectCollect.js";
import { spawnStartProps } from "../../Libraries/Props/spawnStartProps.js";
import { getStartRunAtScene, runSceneController } from "./config/runScenes.js";
import { getTowerStartProps } from "./config/startProps.js";
import { towerRunScenePorts } from "./runScenePorts.js";
/** @param {import("../../GameState/GameStateMachine.js").GameStateMachineContext} ctx */
export function onSimulationEnter(ctx) {
    const { state } = ctx;
    if (!state.runSceneInitialized) {
        runSceneController.reset();
        const startSceneId = getStartRunAtScene();
        runSceneController.startAt(startSceneId, state, ctx);
        state.runSceneInitialized = true;
    }
    runSceneController.enterCurrentScene(state, ctx, { applySpawn: true });
    if (!state.startPropsSpawned) {
        spawnStartProps(state, getTowerStartProps(towerRunScenePorts.getLayout(state)));
        state.startPropsSpawned = true;
    }
}
/** @param {import("../../GameState/GameStateMachine.js").GameStateMachineContext} ctx */
export function onRunSceneTick(ctx, _dt) {
    runSceneController.tick(ctx.state, ctx);
}
export function onCombatEnemyKilled(payload) {
    runSceneController.onEnemyKilled(payload);
}
export function canRunHordeSpawning(_state) {
    return runSceneController.getCurrentCapabilities().horde === true;
}
export function blocksTurretTargeting(_state) {
    return runSceneController.getCurrentCapabilities().blockTurret === true;
}
export function getInspectMissionBanner(state) {
    if (!isInspector(state.phase)) return { show: false, text: "" };
    return getInspectCollectMissionBanner(state);
}
export function findInspectorInspectPickup(state, worldX, worldY) {
    return findInspectCollectPickup(state, worldX, worldY);
}
export function onInspectMissionOpen(state, inspectKey) {
    handleInspectCollectOpen(state, inspectKey);
}
export function onInspectMissionClose(state, inspectKey) {
    handleInspectCollectClose(state, inspectKey);
}
export function isInspectMissionActive(state) {
    return isInspectCollectActive(state);
}
export function onRunOpeningComplete({ state, upgrades }) {
    ProgressionManager.setupNewRunAbilities(state, upgrades);
    unlockProximityFightDialog(state);
}
export function isRadioDialogActive() {
    return isTowerRadioDialogActive();
}
