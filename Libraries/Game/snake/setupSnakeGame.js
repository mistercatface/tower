import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
import { getPropCategoryIndex } from "../../../GameState/SandboxWorldState.js";
import { resolveAgentName } from "../../AI/identity/agentIdentity.js";
import { createAgentPopulationRegistry, aliveAgentInstances } from "../../AI/agents/agentPopulationRegistry.js";
import { AGENT_PROFILE } from "../../AI/agents/agentProfile.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeWallDamageConfig } from "./snakeGameConfig.js";
import { createSnakeAgentSession, spawnSpeciesBatch, tickAliveAgents, syncAgentsAfterPhysics, stopAllAgents } from "./snakeAgentSession.js";
import { SNAKE_GAME_SPECIES } from "./species/index.js";
import { spawnSnakeCavernScene, resolveSnakePlayableBounds } from "./snakeScene.js";
import { mountSnakeHud } from "./snakeHud.js";
import { appendFocusedAgentPathPreviewCommands } from "./focusedAgentPathOverlays.js";
import { appendFocusedAgentTargetOverlayCommands } from "./focusedAgentTargetOverlays.js";
import { appendFocusedAgentVisibleEntityOverlayCommands } from "./focusedAgentVisibleEntityOverlays.js";
import { patchNavWalkableCellIndex } from "../../Procedural/Mazes/walkableCells.js";
import { commitGridNavEdit, setChunkSurfaceProfileRangeEdit } from "../../Sandbox/gridNavEdit.js";
import { applyKineticContactSideEffects } from "../../Spatial/collision/kineticContactSideEffects.js";
import { kineticSpatial } from "../../../Systems/World/KineticSpatialFrame.js";
import { applySnakeHuntContactDrive, resolveSnakeCombatFromContacts } from "./snakeCombat.js";
import { fractureRetiredSnakeSegmentsFromContacts } from "./snakeSegmentFracture.js";
import { beginSnakePerceptionFrame, endSnakePerceptionFrame } from "./snakePerception.js";
import { createGridWallDamage } from "../../Sandbox/gridWallDamage.js";
import { spawnPopulationScene } from "./spawnPopulationInScene.js";
import { CUSTOM_SYSTEMS } from "./customSystems.js";
import { ensureLabPathDebugCache } from "../../Render/map/labMapCaches.js";
import { isShowLabPathDebug, markLabViewDirty, setLabPathDebugEnabled } from "../../../Apps/Editor/ui/preview.js";
import { GAME_MODE_ZOOM_DEFAULT, GAME_MODE_ZOOM_MAX, TILELAB_ZOOM_MIN } from "../../Viewport/tileLabViewportLimits.js";
import { normalizeWorldRenderMode, WORLD_RENDER_MODE_FLAT2D, WORLD_RENDER_MODE_LABELS, WORLD_RENDER_MODE_RADIAL } from "../../../Render/WorldRenderMode.js";
function applySnakeRegionSurfaceProfiles(state, config) {
    const grid = state.obstacleGrid;
    const playable = resolveSnakePlayableBounds(state);
    const regions = config.surfaceRegions;
    const cellSize = grid.cellSize;
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    const topCol = grid.worldCol(playable.boundsCol * cellSize);
    const topRow = grid.worldRow(playable.boundsRow * cellSize);
    const lastCol = topCol + playable.boundsCols - 1;
    const lastRow = topRow + playable.boundsRows - 1;
    const midRow = topRow + Math.floor(playable.boundsRows / 2);
    const chunkOf = (cell) => Math.floor(cell / cellsPerChunk);
    setChunkSurfaceProfileRangeEdit(state, chunkOf(topCol), chunkOf(topRow), chunkOf(lastCol), chunkOf(midRow - 1), regions.topHalfProfileId);
    setChunkSurfaceProfileRangeEdit(state, chunkOf(topCol), chunkOf(midRow), chunkOf(lastCol), chunkOf(lastRow), regions.bottomHalfProfileId);
}
export async function setupSnakeGame(state, { playbackHandlers } = {}) {
    applySnakeGameConfig();
    state.losShadowStrength = 0.77;
    const config = getSnakeGameConfig();
    const scene = await spawnSnakeCavernScene(state);
    const registry = createAgentPopulationRegistry();
    const session = createSnakeAgentSession({ registry, navWalkable: scene.navWalkable, speciesById: SNAKE_GAME_SPECIES });
    state.sandbox.snakeGame = session;
    state.nav.setNavWalkableSyncHook((damageBounds) => patchNavWalkableCellIndex(state, damageBounds));
    await commitGridNavEdit(state, null, { fullNavSync: true });
    scene.navWalkable.rebake();
    applySnakeRegionSurfaceProfiles(state, config);
    let spawnExclude = new Set();
    const spawnPlan = [];
    // Add snakes
    spawnPlan.push({ species: "snake", spawnCtxs: scene.snakes.map((s) => ({ head: s.chain.head, spawnGroupId: s.chain.spawnGroupId })) });
    for (let i = 0; i < scene.snakes.length; i++) {
        const occupied = scene.snakes[i].occupiedIndices;
        if (occupied) for (const idx of occupied) spawnExclude.add(idx);
    }
    // Spawn other configured populations
    for (const profileId of Object.keys(config.agentProfiles)) {
        if (profileId === "snake") continue;
        const agents = spawnPopulationScene(state, scene.navWalkable, profileId, spawnExclude.size ? spawnExclude : null);
        spawnPlan.push({ species: profileId, spawnCtxs: agents.map((a) => ({ head: a.pack.brain ?? a.pack.head, spawnGroupId: a.pack.spawnGroupId })) });
        for (let i = 0; i < agents.length; i++) {
            const occupied = agents[i].occupiedIndices;
            if (occupied) for (const idx of occupied) spawnExclude.add(idx);
        }
    }
    for (let i = 0; i < spawnPlan.length; i++) {
        const { species, spawnCtxs } = spawnPlan[i];
        spawnSpeciesBatch(session, state, species, spawnCtxs);
    }
    const fleeAgentHeads = [];
    for (const instance of aliveAgentInstances(session.registry)) if (instance.profileId === AGENT_PROFILE.flee && instance.head && !instance.head.isDead) fleeAgentHeads.push(instance.head);
    const defaultCameraTarget = fleeAgentHeads.length > 0 ? fleeAgentHeads[Math.floor(Math.random() * fleeAgentHeads.length)] : scene.snakes[0].chain.head;
    setSandboxCameraTarget(state, defaultCameraTarget, true);
    state.viewport.snapTo(defaultCameraTarget.x, defaultCameraTarget.y);
    state.sandbox.gridWallDamage = createGridWallDamage(state, resolveSnakeWallDamageConfig(config.wallDamage));
    state.followCamera.registerPickResolver((propId) => {
        const instance = session.instancesByMemberId.get(propId);
        return instance?.lifecycle === "alive" ? instance.head : null;
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
        hpaDebugToggleControl: {
            get() {
                return isShowLabPathDebug();
            },
            set(enabled) {
                setLabPathDebugEnabled(enabled);
                if (enabled) void ensureLabPathDebugCache(state);
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
    state.followCamera.focus(defaultCameraTarget);
    state.followCamera.bindInput();
    hud.update();
    return {
        initialViewportZoom: GAME_MODE_ZOOM_DEFAULT,
        snakes: scene.snakes,
        cameraTarget: defaultCameraTarget,
        tick(dtMs) {
            const snakeGame = state.sandbox.snakeGame;
            snakeGame._batchingPerception = true;
            try {
                beginSnakePerceptionFrame(state);
                tickAliveAgents(snakeGame, state, dtMs);
                endSnakePerceptionFrame(state);
            } finally {
                snakeGame._batchingPerception = false;
            }
            for (const sys of CUSTOM_SYSTEMS) if (sys.tick) sys.tick(state, dtMs);
            hud.update();
        },
        appendOverlayCommands(out, state) {
            const overlayConfig = getSnakeGameConfig();
            if (overlayConfig.showFocusedAgentDebug !== true) return;
            const snakeGame = state.sandbox.snakeGame;
            const prop = state.followCamera?.targetProp;
            if (!prop) return;
            const instance = snakeGame.instancesByHeadId.get(prop.id);
            if (!instance?.brain) return;
            appendFocusedAgentVisibleEntityOverlayCommands(out, state, snakeGame);
            const pathOverlay = instance.autosim.getPathOverlay();
            if (pathOverlay) appendFocusedAgentPathPreviewCommands(out, pathOverlay, instance.head.radius);
            appendFocusedAgentTargetOverlayCommands(out, state, snakeGame);
        },
        applyContactSideEffects(tick, contacts) {
            applyKineticContactSideEffects(tick, contacts);
            for (const sys of CUSTOM_SYSTEMS) if (sys.resolveContacts) sys.resolveContacts(state, tick.frame, contacts);
            resolveSnakeCombatFromContacts(state, tick.frame, contacts);
            applySnakeHuntContactDrive(state, tick.frame, contacts);
            fractureRetiredSnakeSegmentsFromContacts(state, tick.frame, contacts);
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
            if (snakeGame) stopAllAgents(snakeGame);
            hud.destroy();
        },
    };
}
