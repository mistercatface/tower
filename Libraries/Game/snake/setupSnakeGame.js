import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
import { getPropCategoryIndex } from "../../../GameState/SandboxWorldState.js";
import { resolveAgentName } from "../../AI/identity/agentIdentity.js";
import { createAgentPopulationRegistry, aliveAgentInstances } from "../../AI/agents/AgentProfiles.js";
import { AGENT_PROFILE } from "../../AI/agents/AgentProfiles.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeWallDamageConfig } from "./snakeGameConfig.js";
import { SnakeAgentSession, SNAKE_GAME_SPECIES } from "./snakeAgentSession.js";
import { spawnSnakeCavernScene, resolveSnakePlayableBounds } from "./snakeScene.js";
import { mountSnakeHud } from "./snakeHud.js";
import { overlayCircleFillStroke, overlayPolyline } from "../../Render/overlays/overlayCommands.js";
import { classifyAgentVision } from "../../AI/perception/classifyAgentVision.js";
import { createObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
import { resolveRelationshipForInstances } from "./AgentInstance.js";
import { patchNavWalkableCellIndex } from "../../Procedural/Mazes/walkableCells.js";
import { commitGridNavEdit, setChunkSurfaceProfileRangeEdit } from "../../Sandbox/gridNavEdit.js";
import { applyKineticContactSideEffects } from "../../Spatial/collision/kineticContactSideEffects.js";
import { kineticSpatial } from "../../../Systems/World/KineticSpatialFrame.js";
import { applySnakeHuntContactDrive, resolveSnakeCombatFromContacts } from "./snakeCombat.js";
import { fractureRetiredSnakeSegmentsFromContacts } from "./snakeSegmentFracture.js";
import { beginSnakePerceptionFrame, endSnakePerceptionFrame, requireSnakeVisionFrame } from "./snakePerception.js";
import { createGridWallDamage } from "../../Sandbox/gridWallDamage.js";
import { spawnPopulationScene } from "./spawnPopulationInScene.js";
import { CUSTOM_SYSTEMS } from "./customSystems.js";
import { ensureLabPathDebugCache } from "../../Render/map/labMapCaches.js";
import { cellBoundsToChunkRange } from "../../Spatial/grid/GridCoords.js";
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
    const topCellBounds = { startCol: topCol, startRow: topRow, endCol: lastCol, endRow: midRow - 1 };
    const bottomCellBounds = { startCol: topCol, startRow: midRow, endCol: lastCol, endRow: lastRow };
    setChunkSurfaceProfileRangeEdit(state, cellBoundsToChunkRange(topCellBounds, cellsPerChunk), regions.topHalfProfileId);
    setChunkSurfaceProfileRangeEdit(state, cellBoundsToChunkRange(bottomCellBounds, cellsPerChunk), regions.bottomHalfProfileId);
}
export async function setupSnakeGame(state, { playbackHandlers } = {}) {
    applySnakeGameConfig();
    state.losShadowStrength = 1.0;
    const config = getSnakeGameConfig();
    const scene = await spawnSnakeCavernScene(state);
    const registry = createAgentPopulationRegistry();
    const session = new SnakeAgentSession({ registry, navWalkable: scene.navWalkable, speciesById: SNAKE_GAME_SPECIES });
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
        session.spawnBatch(state, species, spawnCtxs);
    }
    let defaultCameraTarget = null;
    for (const instance of aliveAgentInstances(session.registry))
        if (instance.profileId === AGENT_PROFILE.playerFlee && instance.head && !instance.head.isDead) {
            defaultCameraTarget = instance.head;
            break;
        }
    if (!defaultCameraTarget) {
        const fleeAgentHeads = [];
        for (const instance of aliveAgentInstances(session.registry)) if (instance.profileId === AGENT_PROFILE.flee && instance.head && !instance.head.isDead) fleeAgentHeads.push(instance.head);
        defaultCameraTarget = fleeAgentHeads.length > 0 ? fleeAgentHeads[Math.floor(Math.random() * fleeAgentHeads.length)] : scene.snakes[0].chain.head;
    }
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
        debugInspectControl: {
            get() {
                return state.editor.debugInspect;
            },
            set(enabled) {
                state.editor.debugInspect = enabled;
            },
        },
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
                snakeGame.tick(state, dtMs);
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
            if (snakeGame) snakeGame.syncAfterPhysics(state);
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
            if (snakeGame) snakeGame.stopAll();
            hud.destroy();
        },
    };
}
const DEFAULT_PREVIEW_CELL_COUNT = 3;
function focusedPathPreviewStyle(config) {
    const style = config.focusedAgentDebug?.pathPreview ?? {};
    return {
        cellCount: style.cellCount ?? DEFAULT_PREVIEW_CELL_COUNT,
        stroke: style.stroke ?? "rgba(156, 39, 176, 0.6)",
        nodeFill: style.nodeFill ?? "rgba(156, 39, 176, 0.22)",
        nodeStroke: style.nodeStroke ?? "rgba(156, 39, 176, 0.75)",
        lineWidthScale: style.lineWidthScale ?? 0.35,
        nodeRadiusScale: style.nodeRadiusScale ?? 0.45,
    };
}
export function appendFocusedAgentPathPreviewCommands(out, pathOverlay, headRadius) {
    if (!pathOverlay?.pathNodes?.length) return;
    const style = focusedPathPreviewStyle(getSnakeGameConfig());
    const headR = headRadius ?? 3;
    const lineWidth = Math.max(0.75, headR * style.lineWidthScale);
    const nodeR = Math.max(1.5, headR * style.nodeRadiusScale);
    const nodes = pathOverlay.pathNodes.slice(0, style.cellCount);
    if (nodes.length < 2) return;
    out.push(overlayPolyline(nodes, { stroke: style.stroke, lineWidth }));
    for (let i = 0; i < nodes.length; i++) out.push(overlayCircleFillStroke(nodes[i].x, nodes[i].y, nodeR, { fill: style.nodeFill, stroke: style.nodeStroke, lineWidth: 1 }));
}
function focusedTargetRingStyle(config) {
    const style = config.focusedAgentDebug?.targetRing ?? {};
    return { fill: style.fill ?? "rgba(255, 60, 60, 0.22)", stroke: style.stroke ?? "rgba(255, 80, 80, 0.9)", entityPad: style.entityPad ?? 2, cellScale: style.cellScale ?? 0.38 };
}
export function resolveCommittedTargetWorld(state, intentTarget) {
    if (!intentTarget) return null;
    const { targetId, destination } = intentTarget;
    const grid = state.obstacleGrid;
    if (targetId != null) {
        const prop = state.entityRegistry.getLive(targetId);
        if (prop && !prop.isDead) return { x: prop.x, y: prop.y, radius: prop.radius ?? 3, kind: "entity" };
    }
    const world = destination?.world ?? destination?.routeWorld ?? destination?.terminalWorld;
    if (world) return { x: world.x, y: world.y, radius: grid.cellSize * 0.5, kind: "cell" };
    if (destination?.col != null && destination?.row != null) {
        const bounds = grid.getCellBounds(destination.col, destination.row);
        return { x: (bounds.minX + bounds.maxX) * 0.5, y: (bounds.minY + bounds.maxY) * 0.5, radius: grid.cellSize * 0.5, kind: "cell" };
    }
    return null;
}
function readIntentTarget(instance) {
    const intent = instance?.intent;
    if (!intent) return null;
    return { mode: intent.getMode(), targetId: intent.getTargetId(), destination: intent.getDestination() };
}
export function appendFocusedAgentTargetOverlayCommands(out, state, session) {
    const prop = state.followCamera?.targetProp;
    if (!prop) return;
    const instance = session.instancesByHeadId.get(prop.id);
    const target = resolveCommittedTargetWorld(state, readIntentTarget(instance));
    if (!target) return;
    const style = focusedTargetRingStyle(session.config);
    const radius = target.kind === "entity" ? target.radius + style.entityPad : target.radius * style.cellScale;
    out.push(overlayCircleFillStroke(target.x, target.y, radius, { fill: style.fill, stroke: style.stroke, lineWidth: 1.5 }));
}
function agentRingStyle(config, slot) {
    const slots = config.focusedAgentDebug?.agentSlots ?? {};
    const fallback = {
        threat: { fill: "rgba(255, 90, 90, 0.14)", stroke: "rgba(255, 120, 120, 0.55)", pad: 3 },
        prey: { fill: "rgba(255, 180, 60, 0.14)", stroke: "rgba(255, 220, 80, 0.55)", pad: 3 },
        ally: { fill: "rgba(100, 180, 255, 0.14)", stroke: "rgba(120, 220, 255, 0.55)", pad: 3 },
    };
    return { ...fallback[slot], ...slots[slot] };
}
function appendAgentRing(out, agent, style) {
    if (!agent || agent.isDead) return;
    const radius = agent.radius ?? 3;
    const pad = style.pad ?? 3;
    out.push(overlayCircleFillStroke(agent.x, agent.y, radius + pad, { fill: style.fill, stroke: style.stroke, lineWidth: style.lineWidth ?? 1 }));
}
export function appendFocusedAgentVisibleEntityOverlayCommands(out, state, session) {
    const config = session.config;
    const shared = config.shared;
    const prop = state.followCamera?.targetProp;
    if (!prop) return;
    const instance = session.instancesByHeadId.get(prop.id);
    const head = instance?.head;
    if (!head) return;
    const visionRange = instance.visionRange;
    const frame = state.nav.observerVisionFrame ?? createObserverVisionFrame({ tickId: session.simTick ?? 1, navTopology: state.nav.topology, visionRange, viewport: state.viewport });
    const agentCtx = { instance, session };
    const committedTargetId = instance.intent.getTargetId();
    const perceptionOptions = {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: shared.fleeRange ?? visionRange.range,
        resolveRelationship: (selfInstance, targetInstance, _gameState, distSq) => resolveRelationshipForInstances(selfInstance, targetInstance, distSq),
        committedTargetId,
        targetStickyFactor: shared.targetingHysteresis.targetStickyFactor ?? 0.75,
    };
    const vision = frame.ensureHeadVision(head, visionRange);
    const world = classifyAgentVision(state, instance, perceptionOptions);
    if (world.threat) appendAgentRing(out, world.threat, agentRingStyle(config, "threat"));
    if (world.prey && world.prey.id !== committedTargetId) appendAgentRing(out, world.prey, agentRingStyle(config, "prey"));
    if (world.ally) appendAgentRing(out, world.ally, agentRingStyle(config, "ally"));
}
