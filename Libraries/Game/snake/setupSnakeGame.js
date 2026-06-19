import { getChainMemberIds } from "../../Sandbox/chainLinks.js";
import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "./snakeGameConfig.js";
import { createSnakeAutosim } from "./snakeAutosim.js";
import { spawnSnakeCavernScene } from "./snakeScene.js";
import { applySnakeHeadGameplay } from "./snakeHeadGameplay.js";
import { createSnakeLifecycleRegistry, registerAliveSnake, isAliveSnakeHead } from "./snakeLifecycle.js";
import { mountSnakeHud } from "./snakeHud.js";
export async function setupSnakeGame(state) {
    applySnakeGameConfig();
    const config = getSnakeGameConfig();
    const scene = await spawnSnakeCavernScene(state);
    const behaviorById = state.sandbox.controller.getBehaviorByIdMap();
    const registry = createSnakeLifecycleRegistry();
    const autosimsByHeadId = new Map();
    state.sandbox.snakeGame = { registry, autosimsByHeadId };
    let playerSnake = null;
    for (let i = 0; i < scene.snakes.length; i++) {
        const snake = scene.snakes[i];
        applySnakeHeadGameplay(snake.chain.head);
        registerAliveSnake(registry, snake.chain.head.id);
        const autosim = createSnakeAutosim(state, { headId: snake.chain.head.id, behaviorById, visionCone: snake.cameraFollow && config.playerVisionCone ? config.playerVisionCone : null });
        autosim.start();
        autosimsByHeadId.set(snake.chain.head.id, autosim);
        if (snake.cameraFollow) {
            if (playerSnake) throw new Error("Snake game config has multiple cameraFollow snakes");
            playerSnake = snake;
            setSandboxCameraTarget(state, snake.chain.head, true);
            state.viewport.snapTo(snake.chain.head.x, snake.chain.head.y);
        }
    }
    if (!playerSnake) throw new Error("Snake game config requires one snake with cameraFollow: true");
    void state.navigation.onObstaclesChanged(null);
    const playerHeadId = playerSnake.chain.head.id;
    const getSegmentCount = () => getChainMemberIds(state, playerHeadId).length;
    const hud = mountSnakeHud(getSegmentCount, { getKineticSolverStats: config.showKineticSolverStats ? () => state.sandbox.kineticSolverStats ?? null : null });
    hud.update();
    const snakeHeadIds = config.showAllSnakeVisionCones ? scene.snakes.map((snake) => snake.chain.head.id) : [playerHeadId];
    return {
        head: playerSnake.chain.head,
        goal: scene.goals[0] ?? null,
        goals: scene.goals,
        snakes: scene.snakes,
        cameraTarget: playerSnake.chain.head,
        showVisionCones: config.showVisionCones,
        showMemoryHeatmap: config.showMemoryHeatmap,
        showKineticSolverStats: config.showKineticSolverStats,
        snakeHeadIds,
        memoryHeatmapHeadId: playerHeadId,
        getSnakeBrain(headId) {
            return autosimsByHeadId.get(headId)?.getBrain() ?? null;
        },
        getSegmentCount,
        tick(_dt) {
            for (const [headId, autosim] of autosimsByHeadId) {
                if (!isAliveSnakeHead(registry, headId)) continue;
                autosim.tick(_dt);
            }
            hud.update();
        },
        stop() {
            for (const autosim of autosimsByHeadId.values()) autosim.stop();
            hud.destroy();
        },
    };
}
