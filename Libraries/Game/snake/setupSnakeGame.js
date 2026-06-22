import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
import { resolveAgentName } from "../../AI/identity/agentIdentity.js";
import { CameraTargetCycler } from "../../Sandbox/CameraTargetCycler.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeWallDamageConfig } from "./snakeGameConfig.js";
import { createAgentPopulationRegistry } from "../../AI/agents/agentPopulationRegistry.js";
import { createSnakeAgentSession, spawnSpeciesBatch, validateAliveAgents, tickAliveAgents, syncAgentsAfterPhysics, stopAllAgents } from "./snakeAgentSession.js";
import { SNAKE_GAME_SPECIES } from "./species/index.js";
import { getSnakeInstance } from "./SnakeInstance.js";
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
import { spawnFleeAgentsScene } from "./fleeAgent/spawnFleeAgentsInScene.js";
export async function setupSnakeGame(state) {
    applySnakeGameConfig();
    const config = getSnakeGameConfig();
    const scene = await spawnSnakeCavernScene(state);
    const registry = createAgentPopulationRegistry();
    const session = createSnakeAgentSession(state, { registry, navWalkable: scene.navWalkable, speciesById: SNAKE_GAME_SPECIES });
    state.sandbox.snakeGame = session;
    state.nav.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
    await commitGridNavEdit(state, null, { fullNavSync: true });
    scene.navWalkable.rebake();
    let fleeSpawnExclude = new Set();
    for (let i = 0; i < scene.snakes.length; i++) {
        const occupied = scene.snakes[i].occupiedIndices;
        if (!occupied) continue;
        for (const idx of occupied) fleeSpawnExclude.add(idx);
    }
    const fleeAgents = spawnFleeAgentsScene(state, scene.navWalkable, fleeSpawnExclude.size ? fleeSpawnExclude : null);
    const spawnPlan = [
        { species: "snake", spawnCtxs: scene.snakes.map((s) => ({ headId: s.chain.head.id, spawnGroupId: s.chain.spawnGroupId, navWalkable: scene.navWalkable })) },
        { species: "flee_agent", spawnCtxs: fleeAgents.map((f) => ({ headId: f.pack.head.id, spawnGroupId: f.pack.spawnGroupId })) },
    ];
    for (let i = 0; i < spawnPlan.length; i++) {
        const { species, spawnCtxs } = spawnPlan[i];
        spawnSpeciesBatch(session, state, species, spawnCtxs);
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
        return session.autosimsByHeadId.get(focusedId) ?? null;
    }
    function onHeadDied(headId) {
        if (cameraCycler.focusedId === headId) cameraCycler.setFocusedId(null);
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
        releaseCameraFocus() {
            cameraCycler.setFocusedId(null);
            state.sandbox.controller?.session?.clearSelection();
            hud.update();
        },
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
                autosimsByHeadId: session.autosimsByHeadId,
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
            validateAliveAgents(snakeGame, state);
            snakeGame._batchingPerception = true;
            beginSnakePerceptionFrame(state);
            tickAliveAgents(snakeGame, state, dtMs);
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
            validateAliveAgents(state.sandbox.snakeGame, state);
        },
        afterKineticPhysics() {
            const snakeGame = state.sandbox.snakeGame;
            if (snakeGame) syncAgentsAfterPhysics(snakeGame, state);
        },
        stop() {
            cameraCycler.destroy();
            const snakeGame = state.sandbox.snakeGame;
            if (snakeGame) stopAllAgents(snakeGame, state);
            hud.destroy();
        },
    };
}
