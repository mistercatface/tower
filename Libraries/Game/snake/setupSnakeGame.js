import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
import { applySnakeGameConfig } from "./snakeGameConfig.js";
import { createSnakeAutosim } from "./snakeAutosim.js";
import { spawnSnakeCavernScene } from "./snakeScene.js";
export async function setupSnakeGame(state) {
    applySnakeGameConfig();
    const scene = await spawnSnakeCavernScene(state);
    const behaviorById = state.sandbox.controller.getBehaviorByIdMap();
    const autosim = createSnakeAutosim(state, { headId: scene.chain.head.id, goalPropId: scene.goal.id, behaviorById });
    autosim.start();
    setSandboxCameraTarget(state, scene.chain.head, true);
    state.viewport.snapTo(scene.chain.head.x, scene.chain.head.y);
    void state.navigation.onObstaclesChanged(null);
    return {
        head: scene.chain.head,
        goal: scene.goal,
        cameraTarget: scene.chain.head,
        tick(_dt) {
            autosim.tick(_dt);
        },
        stop() {
            autosim.stop();
        },
    };
}
