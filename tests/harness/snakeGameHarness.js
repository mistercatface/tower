import "../nodeCanvasSetup.js";
import { EntityRegistry, addWorldPropToState } from "../../GameState/EntityRegistry.js";
import { KineticSession } from "../../GameState/KineticSession.js";
import { SandboxWorldState } from "../../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { CircleShape } from "../../Libraries/Spatial/collision/Shapes.js";
import { WorldProp } from "../../Entities/WorldProp.js";
import { createDefaultMapGenBoundsConfig } from "../../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../../Libraries/Motion/kineticConstraints.js";
import { spawnLinkedBallChain } from "../../Libraries/Sandbox/spawnLinkedBallChain.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { createDirectGroundNavBehavior } from "../../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { createCellTargetHpaNav } from "../../Libraries/Sandbox/groundNav/cellTargetHpaNav.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../../Libraries/Sandbox/groundNav/groundNavIds.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeChainSpawnOptions, resolveSnakeSegmentSpacing } from "../../Libraries/Game/snake/snakeGameConfig.js";
import { applyAgentGameplay } from "./agentTestCompat.js";
import { getAgentHunger, setAgentHunger, createAgentAutosim } from "./agentTestCompat.js";
import { AGENT_PROFILE } from "../../Libraries/AI/agents/AgentProfiles.js";
import { resolveSnakeNavWalkableFloodSeedBounds } from "../../Libraries/Game/snake/snakeScene.js";
import { SNAKE_SHARD_PROP_ID } from "../../Libraries/Game/snake/snakeSegmentFracture.js";
import { createWorkerNavigation } from "../../Libraries/Navigation/WorkerNavigationFactory.js";
import { createNavWalkableAccess } from "../../Libraries/Procedural/Mazes/walkableCells.js";
import { createSnakeAgentSession, registerAgentInstance } from "../../Libraries/Game/snake/snakeAgentSession.js";
import { SNAKE_GAME_SPECIES } from "./agentTestCompat.js";
import { createAgentPopulationRegistry } from "../../Libraries/AI/agents/AgentProfiles.js";
import { FollowCamera } from "../../Libraries/Sandbox/FollowCamera.js";
import { AgentInstance } from "../../Libraries/Game/snake/AgentInstance.js";
import { beginSnakePerceptionFrame, requireSnakeVisionFrame } from "../../Libraries/Game/snake/snakePerception.js";
import { resolveRelationshipForInstances } from "./agentTestCompat.js";
import { getObserverVisionFrame } from "../../Libraries/Navigation/perception/observerVisionFrame.js";
import { getPropCategoryIndex } from "../../GameState/SandboxWorldState.js";
export function buildTestAgentPerceptionOptions(visionRange, shared, agentCtx, committedTargetId) {
    return {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: shared.fleeRange ?? visionRange.range,
        resolveRelationship: (selfInstance, targetInstance, _gameState, distSq) => resolveRelationshipForInstances(selfInstance, targetInstance, distSq),
        committedTargetId,
        targetStickyFactor: shared.targetingHysteresis?.targetStickyFactor ?? 0.75,
    };
}
export function wireSnakeTestNavSession(state) {
    if (!state.nav?.session) throw new Error("wireSnakeTestNavSession: state.nav with session is required");
    state.nav.settings = { stuckMoveThreshold: 0.5, stuckReplanFrames: 30, idlePathReplanMs: 5000, ...state.nav.settings };
    state.viewport = state.viewport ?? { circleInBounds: () => true, snapTo() {} };
}
function ensureSnakePlayableBounds(state) {
    if (state.sandbox.snakePlayableBounds) return;
    const c = state.editor.cavernConfig;
    state.sandbox.snakePlayableBounds = { boundsMode: "rect", boundsCol: c.boundsCol, boundsRow: c.boundsRow, boundsCols: c.boundsCols, boundsRows: c.boundsRows };
}
export function createSnakeNavWalkable(state) {
    ensureSnakePlayableBounds(state);
    const bounds = state.sandbox.snakePlayableBounds;
    const splitMap = state.editor.railConfig && state.editor.railConfig.boundsRow > state.editor.cavernConfig.boundsRow;
    const floodSeedBounds = splitMap ? resolveSnakeNavWalkableFloodSeedBounds(state) : null;
    const navWalkable = createNavWalkableAccess(state, bounds, floodSeedBounds ? { floodSeedBounds } : {});
    navWalkable.rebake();
    return navWalkable;
}
export function snakeGameNavWalkable(state) {
    return state.sandbox.snakeGame.navWalkable;
}
export function stubSnakeAutosim() {
    return { start() {}, stop() {} };
}
export function registerSnakeTestInstance(state, snakeGame, { headId, spawnGroupId, autosim = null }) {
    const resolvedAutosim = autosim ?? stubSnakeAutosim();
    const head = state.entityRegistry.getLive(headId);
    const instance = new AgentInstance(state, { profileId: AGENT_PROFILE.snake, head, spawnGroupId, lifecycle: "alive" });
    instance.autosim = resolvedAutosim;
    registerAgentInstance(snakeGame, "snake", instance);
    instance.grantSteeringLease();
    return instance;
}
export function wireSnakeTestGame(state, snakes = [], { navWalkable = null } = {}) {
    if (state.nav?.session) wireSnakeTestNavSession(state);
    const registry = createAgentPopulationRegistry();
    const resolvedNavWalkable = navWalkable ?? createSnakeNavWalkable(state);
    const snakeGame = createSnakeAgentSession({ registry, navWalkable: resolvedNavWalkable, speciesById: SNAKE_GAME_SPECIES });
    state.sandbox.snakeGame = snakeGame;
    for (const snake of snakes) {
        const autosim = snake.autosim ?? stubSnakeAutosim();
        registerSnakeTestInstance(state, snakeGame, { ...snake, autosim });
    }
    return { registry, snakeGame };
}
export function createWiredSnakeAutosim(state, { headId, eatRadius = null, initialFoodFraction = null }) {
    wireSnakeTestNavSession(state);
    const instance = state.sandbox.snakeGame.instancesByHeadId.get(headId);
    if (!instance) throw new Error(`createWiredSnakeAutosim: missing agent instance ${headId}`);
    if (eatRadius != null) instance.eatRadius = eatRadius;
    applyAgentGameplay(instance.profile.gameplay.leader, instance.head);
    const autosim = createAgentAutosim(state, instance);
    instance.autosim = autosim;
    // Test-only read views over the public instance surface. No production code depends on these.
    autosim.instance = instance;
    autosim.getMode = () => instance.intent.getMode();
    autosim.getTargetId = () => instance.intent.getTargetId();
    autosim.getDestination = () => instance.intent.getDestination();
    autosim.getLastTransitionReason = () => instance.intent.getLastTransitionReason();
    autosim.getFsmSnapshot = () => ({ decision: instance.intent.getDecisionContext() });
    autosim.isSprinting = () => instance.sprinting;
    autosim.getFoodTimerFraction = () => getAgentHunger(instance.metabolism);
    const baseStart = autosim.start;
    autosim.start = function () {
        baseStart.call(autosim);
        if (initialFoodFraction != null) setAgentHunger(instance.metabolism, initialFoodFraction);
        // Establish the initial mode from what is currently visible (production start() no longer perceives).
        autosim.tick(0);
    };
    return autosim;
}
export async function createSnakeGameHarnessState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = rows;
    const nav = await createWorkerNavigation(grid);
    const state = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        nav,
        viewport: { circleInBounds: () => true, snapTo() {} },
    };
    state.followCamera = new FollowCamera(state);
    const hpaBehavior = createHpaGroundNavBehavior(state);
    const directBehavior = createDirectGroundNavBehavior(state);
    const behaviorById = new Map([
        [HPA_GROUND_NAV_BEHAVIOR_ID, hpaBehavior],
        [DIRECT_GROUND_NAV_BEHAVIOR_ID, directBehavior],
    ]);
    state.sandbox.controller = { getBehaviorByIdMap: () => behaviorById };
    wireSnakeTestNavSession(state);
    return { state, hpaBehavior };
}
export function wireSnakeGameForHead(state, headId, spawnGroupId = `test:${headId}`) {
    return wireSnakeTestGame(state, [{ headId, spawnGroupId }]).registry;
}
export function primeSnakeHeadVision(state, seeker, visionRange) {
    beginSnakePerceptionFrame(state);
    return getObserverVisionFrame(state).ensureHeadVision(seeker, visionRange);
}
export function spawnSnakeFoodShardAtCell(state, cell, { foodValue = null } = {}) {
    const { x, y } = state.obstacleGrid.gridToWorld(cell.col, cell.row);
    const shard = new WorldProp(x, y, SNAKE_SHARD_PROP_ID, 0);
    shard.shape = new CircleShape(2);
    shard.radius = 2;
    shard.snakeFoodValue = foodValue ?? getSnakeGameConfig().agentProfiles.snake.metabolism.foodValue;
    addWorldPropToState(state, shard);
    getPropCategoryIndex(state, "food").register(shard);
    return shard;
}
export async function buildSnakeGameSession(state) {
    applySnakeGameConfig();
    resetKineticConstraintIds(1);
    const config = getSnakeGameConfig();
    const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, resolveSnakeChainSpawnOptions(config));
    wireSnakeGameForHead(state, chain.head.id, chain.spawnGroupId);
    const food = spawnSnakeFoodShardAtCell(state, { col: 14, row: 10 });
    const behaviorById = state.sandbox.controller.getBehaviorByIdMap();
    const autosim = createWiredSnakeAutosim(state, { headId: chain.head.id, eatRadius: 20 });
    autosim.start();
    return {
        food,
        cameraTarget: chain.head,
        tick(dt) {
            autosim.tick(dt);
        },
        stop() {
            autosim.stop();
        },
    };
}
