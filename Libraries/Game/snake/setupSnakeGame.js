import { getChainMemberIds } from "../../Sandbox/chainLinks.js";
import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "./snakeGameConfig.js";
import { createSnakeAutosim } from "./snakeAutosim.js";
import { spawnSnakeCavernScene } from "./snakeScene.js";
import { applySnakeHeadGameplay } from "./snakeHeadGameplay.js";
import { mountSnakeHud } from "./snakeHud.js";
export async function setupSnakeGame(state) {
    applySnakeGameConfig();
    const scene = await spawnSnakeCavernScene(state);
    const behaviorById = state.sandbox.controller.getBehaviorByIdMap();
    const autosims = [];
    let playerSnake = null;
    for (let i = 0; i < scene.snakes.length; i++) {
        const snake = scene.snakes[i];
        applySnakeHeadGameplay(snake.chain.head);
        const autosim = createSnakeAutosim(state, { headId: snake.chain.head.id, behaviorById });
        autosim.start();
        autosims.push(autosim);
        if (snake.cameraFollow) {
            if (playerSnake) throw new Error("Snake game config has multiple cameraFollow snakes");
            playerSnake = snake;
            setSandboxCameraTarget(state, snake.chain.head, true);
            state.viewport.snapTo(snake.chain.head.x, snake.chain.head.y);
        }
    }
    if (!playerSnake) throw new Error("Snake game config requires one snake with cameraFollow: true");
    void state.navigation.onObstaclesChanged(null);
    const getSegmentCount = () => getChainMemberIds(state, playerSnake.chain.head.id).length;
    const hud = mountSnakeHud(getSegmentCount);
    hud.update();
    const config = getSnakeGameConfig();
    const snakeHeadIds = config.showAllSnakeVisionCones ? scene.snakes.map((snake) => snake.chain.head.id) : [playerSnake.chain.head.id];
    return {
        head: playerSnake.chain.head,
        goal: scene.goals[0] ?? null,
        goals: scene.goals,
        snakes: scene.snakes,
        cameraTarget: playerSnake.chain.head,
        showVisionCones: config.showVisionCones,
        showMemoryHeatmap: config.showMemoryHeatmap,
        snakeHeadIds,
        getSegmentCount,
        tick(_dt) {
            for (let i = 0; i < autosims.length; i++) autosims[i].tick(_dt);
            hud.update();
        },
        stop() {
            for (let i = 0; i < autosims.length; i++) autosims[i].stop();
            hud.destroy();
        },
    };
}
