import { resolveAliveAgentInstanceFromProp } from "./resolveAliveAgentInstanceFromProp.js";
import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
import { getPropCategoryIndex } from "../../../GameState/SandboxWorldState.js";
import { resolveAgentName } from "../../AI/identity/agentIdentity.js";
import { createAgentPopulationRegistry, aliveAgentInstances } from "../../AI/agents/agentPopulationRegistry.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeWallDamageConfig } from "./snakeGameConfig.js";
import { createSnakeAgentSession, spawnSpeciesBatch, validateAliveAgents, tickAliveAgents, syncAgentsAfterPhysics, stopAllAgents } from "./snakeAgentSession.js";
import { SNAKE_GAME_SPECIES } from "./species/index.js";
import { spawnSnakeCavernScene } from "./snakeScene.js";
import { mountSnakeHud } from "./snakeHud.js";
import { appendFocusedAgentPathPreviewCommands } from "./focusedAgentPathOverlays.js";
import { appendFocusedAgentTargetOverlayCommands } from "./focusedAgentTargetOverlays.js";
import { appendFocusedAgentVisibleEntityOverlayCommands } from "./focusedAgentVisibleEntityOverlays.js";
import { patchNavWalkableCellIndex } from "../../Procedural/Mazes/walkableCells.js";
import { commitGridNavEdit } from "../../Sandbox/gridNavEdit.js";
import { applyKineticContactSideEffects } from "../../Spatial/collision/kineticContactSideEffects.js";
import { kineticSpatial } from "../../../Systems/World/KineticSpatialFrame.js";
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
    state.followCamera.registerPickResolver((propId) => {
        const instance = resolveAliveAgentInstanceFromProp(state, propId);
        return instance ? instance.head : null;
    });
    state.followCamera.registerCandidateList(() => {
        const instances = [];
        for (const instance of aliveAgentInstances(session.registry)) if (instance?.lifecycle === "alive" && instance.head && !instance.head.isDead) instances.push(instance.head);
        return instances;
    });
    const onTargetChanged = () => {
        hud.update();
    };
    state.followCamera.addOnTargetChanged(onTargetChanged);
    const getFocusedSnakeName = () => {
        const prop = state.followCamera.targetProp;
        if (!prop) return "No Target";
        return resolveAgentName(prop.id, "Snake");
    };
    const hud = mountSnakeHud({
        onCycleCamera: () => state.followCamera.cycle(),
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
    state.followCamera.focus(centerSnake.chain.head);
    state.followCamera.bindInput();
    hud.update();
    return {
        initialViewportZoom: GAME_MODE_ZOOM_DEFAULT,
        snakes: scene.snakes,
        cameraTarget: centerSnake.chain.head,
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
        appendOverlayCommands(out, state) {
            const overlayConfig = getSnakeGameConfig();
            if (overlayConfig.showFocusedAgentDebug !== true) return;
            const snakeGame = state.sandbox?.snakeGame;
            const prop = state.followCamera?.targetProp;
            if (!prop) return;
            const instance = snakeGame?.instancesByHeadId.get(prop.id);
            if (!instance?.autosim || typeof instance.autosim.getBrain !== "function") return;
            appendFocusedAgentVisibleEntityOverlayCommands(out, state, snakeGame, overlayConfig);
            const pathOverlay = instance.autosim.getPathOverlay?.();
            if (pathOverlay) appendFocusedAgentPathPreviewCommands(out, pathOverlay, instance.head.radius, overlayConfig);
            appendFocusedAgentTargetOverlayCommands(out, state, snakeGame, overlayConfig);
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
            const index = getPropCategoryIndex(state, "food");
            const active = kineticSpatial._activeKineticBodies;
            for (let i = 0; i < active.length; i++) {
                const body = active[i];
                if (body._cellIndexCell !== undefined && body._cellIndexCell !== -1) index.reconcile(body);
            }
        },
        stop() {
            state.followCamera.removeOnTargetChanged(onTargetChanged);
            state.followCamera.destroy();
            const snakeGame = state.sandbox.snakeGame;
            if (snakeGame) stopAllAgents(snakeGame, state);
            hud.destroy();
        },
    };
}
