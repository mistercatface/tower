import { spawnStartProps } from "../../Libraries/Props/spawnStartProps.js";
import { getStartRunAtScene, runSceneController } from "./config/runScenes.js";
import { getTowerStartProps } from "./config/startProps.js";
import { towerRunScenePorts } from "./runScenePorts.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").RunScenePort} RunScenePort */
/** @type {RunScenePort} */
export const towerRunScenePort = {
    ports: towerRunScenePorts,
    getLayout(state) {
        return towerRunScenePorts.getLayout(state);
    },
    onSimulationEnter(ctx) {
        const { state } = ctx;
        if (!state.runSceneInitialized) {
            runSceneController.reset();
            runSceneController.startAt(getStartRunAtScene(), state, ctx);
            state.runSceneInitialized = true;
        }
        runSceneController.enterCurrentScene(state, ctx, { applySpawn: true });
        if (!state.startPropsSpawned) {
            spawnStartProps(state, getTowerStartProps(towerRunScenePorts.getLayout(state)));
            state.startPropsSpawned = true;
        }
    },
    onTick(ctx, _dt) {
        runSceneController.tick(ctx.state, ctx);
    },
    getCapabilities(_state) {
        const cap = runSceneController.getCurrentCapabilities();
        return { horde: cap.horde === true, blockTurret: cap.blockTurret === true };
    },
    onEnemyKilled(payload) {
        runSceneController.onEnemyKilled(payload);
    },
};
