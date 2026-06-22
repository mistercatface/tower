import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
import { resolveAgentName } from "../../AI/identity/agentIdentity.js";
import { CameraTargetCycler } from "../../Sandbox/CameraTargetCycler.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeWallDamageConfig } from "./snakeGameConfig.js";
import { createSnakeLifecycleRegistry, wireSnakeGameRegistry } from "./snakeLifecycle.js";
import { createAliveSnakeInstance, registerAliveSnakeInstance, getSnakeInstance, syncAliveSnakeInstances, tickAliveSnakeInstances } from "./SnakeInstance.js";
import { spawnSnakeCavernScene } from "./snakeScene.js";
import { mountSnakeHud } from "./snakeHud.js";
import { appendSnakeGameOverlayCommands } from "./appendSnakeGameOverlayCommands.js";
import { appendPropGroundNavPathOverlay } from "../../Sandbox/groundNav/resolveGroundNavPathOverlayBehavior.js";
import { resolveSandboxPathVisual } from "../../Sandbox/sandboxPropMeta.js";
import { selectionPropIds } from "../../Sandbox/sandboxSelectionInspectors.js";
import { patchNavWalkableCellIndex } from "../../Procedural/Mazes/walkableCells.js";
import { commitGridNavEdit } from "../../Sandbox/gridNavEdit.js";
import { applyKineticContactSideEffects } from "../../Spatial/collision/kineticContactSideEffects.js";
import { applySnakeHuntContactDrive, resolveSnakeCombatFromContacts } from "./snakeCombat.js";
import { spawnSnakeStriker, resolveStrikerBallSnakeSplitsFromContacts } from "./snakeStriker.js";
import { fractureRetiredSnakeSegmentsFromContacts } from "./snakeSegmentFracture.js";
import { beginSnakePerceptionFrame, endSnakePerceptionFrame } from "./snakePerception.js";
import { createGridWallDamage } from "../../Sandbox/gridWallDamage.js";
export async function setupSnakeGame(state) {
    applySnakeGameConfig();
    const config = getSnakeGameConfig();
    const scene = await spawnSnakeCavernScene(state);
    const registry = createSnakeLifecycleRegistry();
    const autosimsByHeadId = new Map();
    wireSnakeGameRegistry(state, registry, autosimsByHeadId, scene.navWalkable);
    state.nav.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
    await commitGridNavEdit(state, null, { fullNavSync: true });
    scene.navWalkable.rebake();
    for (let i = 0; i < scene.snakes.length; i++) {
        const snake = scene.snakes[i];
        const instance = createAliveSnakeInstance(state, { headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId, navWalkable: scene.navWalkable });
        registerAliveSnakeInstance(state.sandbox.snakeGame, instance);
        instance.start(state);
    }
    const centerSnake = scene.snakes[0];
    let focusedHeadId = centerSnake.chain.head.id;
    setSandboxCameraTarget(state, centerSnake.chain.head, true);
    state.viewport.snapTo(centerSnake.chain.head.x, centerSnake.chain.head.y);
    const strikerBall = spawnSnakeStriker(state, centerSnake.chain.head);
    state.sandbox.gridWallDamage = createGridWallDamage(state, resolveSnakeWallDamageConfig(config));
    state.sandbox.snakeGame.strikerBall = strikerBall;
    const cameraCycler = new CameraTargetCycler(state, {
        getTargetIds: () => {
            const ids = [];
            for (const headId of registry.aliveByHeadId.keys()) ids.push(headId);
            if (strikerBall) ids.push(strikerBall.id);
            return ids;
        },
        onTargetChanged: () => {
            hud.update();
        },
    });
    function resolveFocusedHeadProp() {
        return cameraCycler.getFocusedProp();
    }
    function resolveFocusedAutosim() {
        const focusedId = cameraCycler.focusedId;
        if (focusedId === strikerBall?.id) return null;
        if (!registry.aliveByHeadId.has(focusedId)) return null;
        return autosimsByHeadId.get(focusedId) ?? null;
    }
    function onHeadDied(headId) {
        if (cameraCycler.focusedId === headId) cameraCycler.retarget(headId);
    }
    state.sandbox.snakeGame.onHeadDied = onHeadDied;
    const getSegmentCount = () => {
        const focusedId = cameraCycler.focusedId;
        if (focusedId === strikerBall?.id) return 0;
        if (!registry.aliveByHeadId.has(focusedId)) return 0;
        return getConnectedBodyIds(state.kinetic, focusedId).length;
    };
    const getFsmDebugLine = config.showSnakeFsmDebug
        ? () => {
              const autosim = resolveFocusedAutosim();
              if (!autosim) return "—";
              return autosim.getFsmDebugLine();
          }
        : null;
    const getFocusedSnakeName = () => {
        const focusedId = cameraCycler.focusedId;
        if (!focusedId) return "No Target";
        if (focusedId === strikerBall?.id) return "Striker";
        return resolveAgentName(focusedId, "Snake");
    };
    const hud = mountSnakeHud({ getFsmDebugLine, onCycleCamera: () => cameraCycler.cycle(), getFocusedSnakeName });
    cameraCycler.setFocusedId(centerSnake.chain.head.id);
    cameraCycler.bindInput();
    hud.update();
    return {
        strikerBall,
        snakes: scene.snakes,
        getFocusedHeadId: () => cameraCycler.focusedId,
        getFocusedSnakeHead: resolveFocusedHeadProp,
        cameraTarget: centerSnake.chain.head,
        cycleCameraFocus: () => cameraCycler.cycle(),
        appendOverlayCommands(out, gameState) {
            const behaviorById = gameState.sandbox.controller?.getBehaviorByIdMap?.();
            if (behaviorById) {
                const sel = gameState.sandbox.controller?.session?.getSelection?.();
                const strikerSelected = sel?.kind === "prop" && selectionPropIds(sel).includes(strikerBall.id);
                if (!strikerSelected) appendPropGroundNavPathOverlay(out, gameState, strikerBall, behaviorById, resolveSandboxPathVisual(gameState, strikerBall));
            }
            if (cameraCycler.focusedId === strikerBall.id) return;
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
            const snakeGame = state.sandbox.snakeGame;
            syncAliveSnakeInstances(state, snakeGame);
            snakeGame._batchingPerception = true;
            beginSnakePerceptionFrame(state);
            tickAliveSnakeInstances(state, snakeGame, dtMs);
            endSnakePerceptionFrame(state);
            snakeGame._batchingPerception = false;
            hud.update();
        },
        applyContactSideEffects(tick, contacts) {
            applyKineticContactSideEffects(tick, contacts);
            resolveSnakeCombatFromContacts(state, tick.frame, contacts, state.sandbox.snakeGame);
            applySnakeHuntContactDrive(state, tick.frame, contacts, state.sandbox.snakeGame);
            resolveStrikerBallSnakeSplitsFromContacts(state, tick.frame, contacts, state.sandbox.snakeGame, strikerBall);
            fractureRetiredSnakeSegmentsFromContacts(state, tick.frame, contacts);
            syncAliveSnakeInstances(state, state.sandbox.snakeGame);
        },
        afterKineticPhysics() {
            const snakeGame = state.sandbox.snakeGame;
            if (snakeGame) for (const instance of snakeGame.instancesByHeadId.values()) instance.updatePressureDiagnostics(state);
        },
        stop() {
            cameraCycler.destroy();
            for (const autosim of autosimsByHeadId.values()) autosim.stop();
            hud.destroy();
        },
    };
}
