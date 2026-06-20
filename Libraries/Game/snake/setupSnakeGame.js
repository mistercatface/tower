import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeWallDamageConfig } from "./snakeGameConfig.js";
import { createSnakeAutosim } from "./snakeAutosim.js";
import { spawnSnakeCavernScene } from "./snakeScene.js";
import { createSnakeLifecycleRegistry, registerAliveSnake, wireSnakeGameRegistry } from "./snakeLifecycle.js";
import { mountSnakeHud } from "./snakeHud.js";
import { appendSnakeGameOverlayCommands } from "./appendSnakeGameOverlayCommands.js";
import { appendPropGroundNavPathOverlay } from "../../Sandbox/groundNav/resolveGroundNavPathOverlayBehavior.js";
import { resolveSandboxPathVisual } from "../../Sandbox/sandboxPropMeta.js";
import { selectionPropIds } from "../../Sandbox/sandboxSelectionInspectors.js";
import { patchNavWalkableCellIndex } from "../../Procedural/Mazes/walkableCells.js";
import { applyKineticContactSideEffects } from "../../Spatial/collision/kineticContactSideEffects.js";
import { resolveSnakeCombatFromContacts } from "./snakeCombat.js";
import { spawnSnakeStriker, resolveStrikerBallSnakeSplitsFromContacts } from "./snakeStriker.js";
import { beginSnakePerceptionFrame, endSnakePerceptionFrame } from "./snakePerception.js";
import { createGridWallDamage } from "../../Sandbox/gridWallDamage.js";
export async function setupSnakeGame(state) {
    applySnakeGameConfig();
    const config = getSnakeGameConfig();
    const scene = await spawnSnakeCavernScene(state);
    const registry = createSnakeLifecycleRegistry();
    const autosimsByHeadId = new Map();
    wireSnakeGameRegistry(state, registry, autosimsByHeadId, scene.navWalkable);
    state.navigation.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
    void state.navigation.onObstaclesChanged(null);
    scene.navWalkable.rebake();
    for (let i = 0; i < scene.snakes.length; i++) {
        const snake = scene.snakes[i];
        registerAliveSnake(registry, snake.chain.head.id);
        const autosim = createSnakeAutosim(state, { headId: snake.chain.head.id, navWalkable: scene.navWalkable });
        autosim.start();
        autosimsByHeadId.set(snake.chain.head.id, autosim);
    }
    const centerSnake = scene.snakes[0];
    let focusedHeadId = centerSnake.chain.head.id;
    setSandboxCameraTarget(state, centerSnake.chain.head, true);
    state.viewport.snapTo(centerSnake.chain.head.x, centerSnake.chain.head.y);
    const strikerBall = spawnSnakeStriker(state, centerSnake.chain.head);
    state.sandbox.gridWallDamage = createGridWallDamage(state, resolveSnakeWallDamageConfig(config));
    state.sandbox.snakeGame.strikerBall = strikerBall;
    function pickNextFocusedHeadId(skipHeadId = null) {
        for (const headId of registry.aliveByHeadId.keys()) if (headId !== skipHeadId) return headId;
        return null;
    }
    function resolveFocusedHeadProp() {
        if (!registry.aliveByHeadId.has(focusedHeadId)) return null;
        return state.entityRegistry.getLive(focusedHeadId);
    }
    function resolveFocusedAutosim() {
        if (!registry.aliveByHeadId.has(focusedHeadId)) return null;
        return autosimsByHeadId.get(focusedHeadId) ?? null;
    }
    function retargetFocusedSnake(skipHeadId = null) {
        const nextHeadId = pickNextFocusedHeadId(skipHeadId);
        focusedHeadId = nextHeadId;
        if (nextHeadId == null) return null;
        const head = state.entityRegistry.getLive(nextHeadId);
        if (cameraFocus === "snake") {
            setSandboxCameraTarget(state, strikerBall, false);
            setSandboxCameraTarget(state, head, true);
        }
        return head;
    }
    function onHeadDied(headId) {
        if (focusedHeadId !== headId) return;
        if (retargetFocusedSnake(headId)) return;
        if (cameraFocus === "snake") focusStrikerCamera();
    }
    state.sandbox.snakeGame.onHeadDied = onHeadDied;
    const getSegmentCount = () => {
        if (!registry.aliveByHeadId.has(focusedHeadId)) return 0;
        return getConnectedBodyIds(state.kinetic, focusedHeadId).length;
    };
    const getFoodTimerFraction = () => {
        const autosim = resolveFocusedAutosim();
        if (!autosim) return 0;
        return autosim.getFoodTimerFraction();
    };
    const getFsmDebugLine = config.showSnakeFsmDebug
        ? () => {
              const autosim = resolveFocusedAutosim();
              if (!autosim) return "—";
              return autosim.getFsmDebugLine();
          }
        : null;
    const hud = mountSnakeHud(getSegmentCount, { getFoodTimerFraction, getFsmDebugLine, onToggleCameraFocus: toggleCameraFocus });
    let cameraFocus = "snake";
    function focusSnakeCamera() {
        const head = resolveFocusedHeadProp() ?? retargetFocusedSnake();
        if (!head) return;
        setSandboxCameraTarget(state, strikerBall, false);
        setSandboxCameraTarget(state, head, true);
        cameraFocus = "snake";
        hud.setCameraFocus("snake");
    }
    function focusStrikerCamera() {
        const head = resolveFocusedHeadProp();
        if (head) setSandboxCameraTarget(state, head, false);
        setSandboxCameraTarget(state, strikerBall, true);
        cameraFocus = "ball";
        hud.setCameraFocus("ball");
    }
    function toggleCameraFocus() {
        if (cameraFocus === "snake") focusStrikerCamera();
        else focusSnakeCamera();
    }
    hud.update();
    return {
        strikerBall,
        goal: scene.goals[0],
        goals: scene.goals,
        snakes: scene.snakes,
        getFocusedHeadId: () => focusedHeadId,
        getFocusedSnakeHead: resolveFocusedHeadProp,
        cameraTarget: centerSnake.chain.head,
        focusSnakeCamera,
        focusStrikerCamera,
        toggleCameraFocus,
        appendOverlayCommands(out, gameState) {
            const behaviorById = gameState.sandbox.controller?.getBehaviorByIdMap?.();
            if (behaviorById) {
                const sel = gameState.sandbox.controller?.session?.getSelection?.();
                const strikerSelected = sel?.kind === "prop" && selectionPropIds(sel).includes(strikerBall.id);
                if (!strikerSelected) appendPropGroundNavPathOverlay(out, gameState, strikerBall, behaviorById, resolveSandboxPathVisual(gameState, strikerBall));
            }
            if (cameraFocus === "ball") return;
            const focusedAutosim = resolveFocusedAutosim();
            if (!focusedAutosim) return;
            appendSnakeGameOverlayCommands(out, gameState, {
                autosimsByHeadId,
                focusedAutosim,
                showVisionCones: config.showVisionCones,
                showMemoryHeatmap: config.showMemoryHeatmap,
                showSnakeFsmDebug: config.showSnakeFsmDebug,
                showAllSnakeVisionCones: config.showAllSnakeVisionCones,
            });
        },
        getSegmentCount,
        tick(dtMs) {
            const dtSec = dtMs / 1000;
            const snakeGame = state.sandbox.snakeGame;
            snakeGame._batchingPerception = true;
            beginSnakePerceptionFrame(state);
            for (const autosim of autosimsByHeadId.values()) autosim.tick(dtSec);
            endSnakePerceptionFrame(state);
            snakeGame._batchingPerception = false;
            hud.update();
        },
        applyContactSideEffects(tick, contacts) {
            applyKineticContactSideEffects(tick, contacts);
            resolveSnakeCombatFromContacts(state, tick.frame, contacts, state.sandbox.snakeGame);
            resolveStrikerBallSnakeSplitsFromContacts(state, tick.frame, contacts, state.sandbox.snakeGame, strikerBall);
        },
        stop() {
            for (const autosim of autosimsByHeadId.values()) autosim.stop();
            hud.destroy();
        },
    };
}
