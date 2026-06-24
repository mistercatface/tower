import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { resolveAliveAgentInstanceFromProp } from "./resolveAliveAgentInstanceFromProp.js";
import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
import { resolveAgentName } from "../../AI/identity/agentIdentity.js";
import { createSnakeAgentCameraFocus } from "./snakeAgentCameraFocus.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeWallDamageConfig } from "./snakeGameConfig.js";
import { createAgentPopulationRegistry } from "../../AI/agents/agentPopulationRegistry.js";
import { createSnakeAgentSession, spawnSpeciesBatch, validateAliveAgents, tickAliveAgents, syncAgentsAfterPhysics, stopAllAgents } from "./snakeAgentSession.js";
import { SNAKE_GAME_SPECIES } from "./species/index.js";
import { spawnSnakeCavernScene } from "./snakeScene.js";
import { mountSnakeHud } from "./snakeHud.js";
import { appendSnakeGameOverlayCommands } from "./appendSnakeGameOverlayCommands.js";
import { patchNavWalkableCellIndex } from "../../Procedural/Mazes/walkableCells.js";
import { commitGridNavEdit } from "../../Sandbox/gridNavEdit.js";
import { applyKineticContactSideEffects } from "../../Spatial/collision/kineticContactSideEffects.js";
import { applySnakeHuntContactDrive, resolveSnakeCombatFromContacts } from "./snakeCombat.js";
import { fractureRetiredSnakeSegmentsFromContacts } from "./snakeSegmentFracture.js";
import { beginSnakePerceptionFrame, endSnakePerceptionFrame } from "./snakePerception.js";
import { createGridWallDamage } from "../../Sandbox/gridWallDamage.js";
import { spawnFleeAgentsScene } from "./fleeAgent/spawnFleeAgentsInScene.js";
import { spawnSquidsInScene } from "./squid/spawnSquidsInScene.js";
import { markLabViewDirty } from "../../../Apps/Editor/ui/preview.js";
import { GAME_MODE_ZOOM_DEFAULT, GAME_MODE_ZOOM_MAX, TILELAB_ZOOM_MIN } from "../../Viewport/tileLabViewportLimits.js";
import { normalizeWorldRenderMode, WORLD_RENDER_MODE_FLAT2D, WORLD_RENDER_MODE_LABELS, WORLD_RENDER_MODE_RADIAL } from "../../../Render/WorldRenderMode.js";
export async function setupSnakeGame(state, { playbackHandlers } = {}) {
    applySnakeGameConfig();
    state.losShadowStrength = 0.77;
    const config = getSnakeGameConfig();
    const scene = await spawnSnakeCavernScene(state);
    const registry = createAgentPopulationRegistry();
    const session = createSnakeAgentSession(state, { registry, navWalkable: scene.navWalkable, speciesById: SNAKE_GAME_SPECIES });
    state.sandbox.snakeGame = session;
    state.nav.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
    await commitGridNavEdit(state, null, { fullNavSync: true });
    scene.navWalkable.rebake();
    let spawnExclude = new Set();
    for (let i = 0; i < scene.snakes.length; i++) {
        const occupied = scene.snakes[i].occupiedIndices;
        if (!occupied) continue;
        for (const idx of occupied) spawnExclude.add(idx);
    }
    const squids = spawnSquidsInScene(state, scene.navWalkable, { excludeIndices: spawnExclude.size ? spawnExclude : null });
    for (let i = 0; i < squids.length; i++) {
        const occupied = squids[i].occupiedIndices;
        if (!occupied) continue;
        for (const idx of occupied) spawnExclude.add(idx);
    }
    const fleeAgents = spawnFleeAgentsScene(state, scene.navWalkable, spawnExclude.size ? spawnExclude : null);
    const spawnPlan = [
        { species: "snake", spawnCtxs: scene.snakes.map((s) => ({ head: s.chain.head, spawnGroupId: s.chain.spawnGroupId, navWalkable: scene.navWalkable })) },
        { species: "squid", spawnCtxs: squids.map((s) => ({ head: s.pack.brain, spawnGroupId: s.pack.spawnGroupId, navWalkable: scene.navWalkable })) },
        { species: "flee_agent", spawnCtxs: fleeAgents.map((f) => ({ head: f.pack.head, spawnGroupId: f.pack.spawnGroupId })) },
    ];
    for (let i = 0; i < spawnPlan.length; i++) {
        const { species, spawnCtxs } = spawnPlan[i];
        spawnSpeciesBatch(session, state, species, spawnCtxs);
    }
    const centerSnake = scene.snakes[0];
    const centerInstance = session.instancesByHeadId.get(centerSnake.chain.head.id);
    setSandboxCameraTarget(state, centerSnake.chain.head, true);
    state.viewport.snapTo(centerSnake.chain.head.x, centerSnake.chain.head.y);
    state.sandbox.gridWallDamage = createGridWallDamage(state, resolveSnakeWallDamageConfig(config));
    const cameraFocus = createSnakeAgentCameraFocus(state, session, {
        onTargetChanged: () => {
            hud.update();
        },
    });
    session.onAgentDied = (instance) => cameraFocus.onAgentDied(instance);
    const getSegmentCount = () => {
        const instance = cameraFocus.getFocusedInstance();
        if (!instance) return 0;
        return getConnectedBodyIds(state.kinetic, instance.headId).length;
    };
    const getFocusedSnakeName = () => {
        const instance = cameraFocus.getFocusedInstance();
        if (!instance) return "No Target";
        return resolveAgentName(instance.headId, "Snake");
    };
    const hud = mountSnakeHud({
        onCycleCamera: () => cameraFocus.cycle(),
        getFocusedSnakeName,
        renderModeControl: {
            get() {
                return normalizeWorldRenderMode(state.worldRenderMode);
            },
            cycle() {
                state.worldRenderMode = normalizeWorldRenderMode(state.worldRenderMode) === WORLD_RENDER_MODE_FLAT2D ? WORLD_RENDER_MODE_RADIAL : WORLD_RENDER_MODE_FLAT2D;
            },
            label(mode) {
                return WORLD_RENDER_MODE_LABELS[mode];
            },
        },
        shadowSliderControl: {
            get() {
                return state.losShadowStrength;
            },
            set(strength) {
                state.losShadowStrength = strength;
            },
        },
        blurToggleControl: {
            get() {
                return state.worldBloomEnabled;
            },
            set(enabled) {
                state.worldBloomEnabled = enabled;
            },
        },
        zoomControl: {
            min: TILELAB_ZOOM_MIN,
            max: GAME_MODE_ZOOM_MAX,
            getZoom() {
                return state.viewport.zoom;
            },
            setZoom(zoom) {
                state.viewport.zoom = zoom;
            },
        },
        playbackHandlers,
        gameState: state,
        onVisualSettingChange: markLabViewDirty,
    });
    cameraFocus.setFocusedInstance(centerInstance);
    cameraFocus.bindInput();
    hud.update();
    return {
        initialViewportZoom: GAME_MODE_ZOOM_DEFAULT,
        snakes: scene.snakes,
        getFocusedInstance: () => cameraFocus.getFocusedInstance(),
        getFocusedHead: () => cameraFocus.getFocusedInstance()?.head ?? null,
        cameraTarget: centerSnake.chain.head,
        cycleCameraFocus: () => cameraFocus.cycle(),
        focusAgentFromProp(propId) {
            const instance = resolveAliveAgentInstanceFromProp(state, propId);
            if (!instance) return false;
            if (cameraFocus.getFocusedInstance() === instance) {
                state.viewport.snapTo(instance.head.x, instance.head.y);
                return true;
            }
            cameraFocus.setFocusedInstance(instance);
            return true;
        },
        releaseCameraFocus() {
            cameraFocus.clear();
            state.sandbox.controller?.session?.clearSelection();
            hud.update();
        },
        getSegmentCount,
        tick(dtMs) {
            const snakeGame = state.sandbox.snakeGame;
            validateAliveAgents(snakeGame, state);
            snakeGame._batchingPerception = true;
            try {
                beginSnakePerceptionFrame(state);
                tickAliveAgents(snakeGame, state, dtMs);
                endSnakePerceptionFrame(state);
            } finally {
                snakeGame._batchingPerception = false;
            }
            hud.update();
        },
        appendOverlayCommands(out, gameState) {
            appendSnakeGameOverlayCommands(out, gameState, { focusedInstance: cameraFocus.getFocusedInstance() });
        },
        applyContactSideEffects(tick, contacts) {
            applyKineticContactSideEffects(tick, contacts);
            resolveSnakeCombatFromContacts(state, tick.frame, contacts, state.sandbox.snakeGame);
            applySnakeHuntContactDrive(state, tick.frame, contacts, state.sandbox.snakeGame);
            fractureRetiredSnakeSegmentsFromContacts(state, tick.frame, contacts);
            validateAliveAgents(state.sandbox.snakeGame, state);
        },
        afterKineticPhysics() {
            const snakeGame = state.sandbox.snakeGame;
            if (snakeGame) syncAgentsAfterPhysics(snakeGame, state);
        },
        stop() {
            cameraFocus.destroy();
            const snakeGame = state.sandbox.snakeGame;
            if (snakeGame) stopAllAgents(snakeGame, state);
            hud.destroy();
        },
    };
}
