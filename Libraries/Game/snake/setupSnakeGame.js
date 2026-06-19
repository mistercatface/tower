import { getChainMemberIds } from "../../Sandbox/chainLinks.js";
import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "./snakeGameConfig.js";
import { createSnakeAutosim } from "./snakeAutosim.js";
import { spawnSnakeCavernScene } from "./snakeScene.js";
import { applySnakeHeadGameplay } from "./snakeHeadGameplay.js";
import { createSnakeLifecycleRegistry, registerAliveSnake, wireSnakeGameRegistry } from "./snakeLifecycle.js";
import { mountSnakeHud } from "./snakeHud.js";
import { resolvePlayerSnakeCombatHud } from "./snakeCombatHud.js";
import { appendSnakeGameOverlayCommands } from "./appendSnakeGameOverlayCommands.js";
export async function setupSnakeGame(state) {
    applySnakeGameConfig();
    const config = getSnakeGameConfig();
    const scene = await spawnSnakeCavernScene(state);
    const registry = createSnakeLifecycleRegistry();
    const autosimsByHeadId = new Map();
    wireSnakeGameRegistry(state, registry, autosimsByHeadId, scene.navWalkable);
    void state.navigation.onObstaclesChanged(null);
    scene.navWalkable.rebake();
    let playerSnake = null;
    for (let i = 0; i < scene.snakes.length; i++) {
        const snake = scene.snakes[i];
        applySnakeHeadGameplay(snake.chain.head);
        registerAliveSnake(registry, snake.chain.head.id);
        const autosim = createSnakeAutosim(state, {
            headId: snake.chain.head.id,
            navWalkable: scene.navWalkable,
            visionCone: snake.cameraFollow && config.playerVisionCone ? config.playerVisionCone : null,
        });
        autosim.start();
        autosimsByHeadId.set(snake.chain.head.id, autosim);
        if (snake.cameraFollow) {
            playerSnake = snake;
            setSandboxCameraTarget(state, snake.chain.head, true);
            state.viewport.snapTo(snake.chain.head.x, snake.chain.head.y);
        }
    }
    const playerHeadId = playerSnake.chain.head.id;
    const playerAutosim = autosimsByHeadId.get(playerHeadId);
    const getSegmentCount = () => getChainMemberIds(state, playerHeadId).length;
    const getCombatStatus = () => resolvePlayerSnakeCombatHud(playerAutosim, state, registry, autosimsByHeadId);
    const getFoodTimerFraction = () => playerAutosim.getFoodTimerFraction();
    const getFsmDebugLine = config.showSnakeFsmDebug ? () => playerAutosim.getFsmDebugLine() : null;
    const hud = mountSnakeHud(getSegmentCount, { getCombatStatus, getFoodTimerFraction, getFsmDebugLine });
    hud.update();
    return {
        head: playerSnake.chain.head,
        goal: scene.goals[0],
        goals: scene.goals,
        snakes: scene.snakes,
        cameraTarget: playerSnake.chain.head,
        appendOverlayCommands(out, gameState) {
            appendSnakeGameOverlayCommands(out, gameState, {
                autosimsByHeadId,
                playerAutosim,
                showVisionCones: config.showVisionCones,
                showMemoryHeatmap: config.showMemoryHeatmap,
                showSnakeFsmDebug: config.showSnakeFsmDebug,
                showAllSnakeVisionCones: config.showAllSnakeVisionCones,
            });
        },
        getSegmentCount,
        tick(dtMs) {
            const dtSec = dtMs / 1000;
            for (const autosim of autosimsByHeadId.values()) autosim.tick(dtSec);
            hud.update();
        },
        stop() {
            for (const autosim of autosimsByHeadId.values()) autosim.stop();
            hud.destroy();
        },
    };
}
