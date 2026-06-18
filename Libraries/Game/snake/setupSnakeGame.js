import { getChainMemberIds } from "../../Sandbox/chainLinks.js";
import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
import { applySnakeGameConfig } from "./snakeGameConfig.js";
import { createSnakeAutosim } from "./snakeAutosim.js";
import { spawnSnakeCavernScene } from "./snakeScene.js";
import { applySnakeHeadGameplay } from "./snakeHeadGameplay.js";
import { mountSnakeHud } from "./snakeHud.js";
export async function setupSnakeGame(state) {
    applySnakeGameConfig();
    const scene = await spawnSnakeCavernScene(state);
    applySnakeHeadGameplay(scene.chain.head);
    const behaviorById = state.sandbox.controller.getBehaviorByIdMap();
    const autosim = createSnakeAutosim(state, { headId: scene.chain.head.id, goalPropId: scene.goal.id, behaviorById });
    autosim.start();
    setSandboxCameraTarget(state, scene.chain.head, true);
    state.viewport.snapTo(scene.chain.head.x, scene.chain.head.y);
    void state.navigation.onObstaclesChanged(null);
    const getSegmentCount = () => getChainMemberIds(state, scene.chain.head.id).length;
    const hud = mountSnakeHud(getSegmentCount);
    hud.update();
    return {
        head: scene.chain.head,
        goal: scene.goal,
        cameraTarget: scene.chain.head,
        getSegmentCount,
        tick(_dt) {
            autosim.tick(_dt);
            hud.update();
        },
        stop() {
            autosim.stop();
            hud.destroy();
        },
    };
}
