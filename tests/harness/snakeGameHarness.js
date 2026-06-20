import { loadPropAssets } from "../../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../../GameState/EntityRegistry.js";
import { KineticSession } from "../../GameState/KineticSession.js";
import { SandboxWorldState } from "../../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../../Libraries/Motion/kineticConstraints.js";
import { spawnLinkedBallChain } from "../../Libraries/Sandbox/spawnLinkedBallChain.js";
import { createDirectGroundNavBehavior } from "../../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../../Libraries/Sandbox/groundNav/groundNavIds.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeAutosim } from "../../Libraries/Game/snake/snakeAutosim.js";
import { resolveSnakeNavWalkableFloodSeedBounds, spawnGoalOrbAtCell } from "../../Libraries/Game/snake/snakeScene.js";
import { createWorkerNavigation } from "../../Libraries/Navigation/WorkerNavigationFactory.js";
import { createNavWalkableAccess } from "../../Libraries/Procedural/Mazes/walkableCells.js";
import { HpaPathSession } from "../../Libraries/Pathfinding/HpaPathSession.js";
import { createSnakeLifecycleRegistry, registerAliveSnake, wireSnakeGameRegistry } from "../../Libraries/Game/snake/snakeLifecycle.js";
import { beginSnakePerceptionFrame } from "../../Libraries/Game/snake/snakePerception.js";
import { getObserverVisionFrame } from "../../Libraries/Navigation/perception/observerVisionFrame.js";
loadPropAssets();
export function wireSnakeTestNavSession(state) {
    if (state.hpaPathSession) return;
    state.hpaPathWorker = state.navigation._hpaPathWorker;
    state.hpaPathSession = new HpaPathSession(state.hpaPathWorker);
    state.viewport = state.viewport ?? { circleInBounds: () => true, snapTo() {} };
    state.navigation.settings = { stuckMoveThreshold: 0.5, stuckReplanFrames: 30, idlePathReplanMs: 5000, ...state.navigation.settings };
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
export function createWiredSnakeAutosim(state, options) {
    wireSnakeTestNavSession(state);
    return createSnakeAutosim(state, { ...options, navWalkable: state.sandbox.snakeGame.navWalkable });
}
export async function createSnakeGameHarnessState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = rows;
    const navigation = await createWorkerNavigation(grid);
    const state = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        navigation,
        hpaPathWorker: navigation._hpaPathWorker,
        viewport: { circleInBounds: () => true, snapTo() {} },
    };
    const hpaBehavior = createHpaGroundNavBehavior(state);
    const directBehavior = createDirectGroundNavBehavior(state);
    const behaviorById = new Map([
        [HPA_GROUND_NAV_BEHAVIOR_ID, hpaBehavior],
        [DIRECT_GROUND_NAV_BEHAVIOR_ID, directBehavior],
    ]);
    state.sandbox.controller = { getBehaviorByIdMap: () => behaviorById };
    wireSnakeTestNavSession(state);
    return { state, behaviorById, hpaBehavior };
}
export function wireSnakeGameForHead(state, headId) {
    wireSnakeTestNavSession(state);
    const registry = createSnakeLifecycleRegistry();
    registerAliveSnake(registry, headId);
    wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
    return registry;
}
export function primeSnakeHeadVision(state, seeker, visionCone) {
    beginSnakePerceptionFrame(state);
    return getObserverVisionFrame(state).ensureHeadVision(seeker, visionCone);
}
export async function buildSnakeGameSession(state) {
    applySnakeGameConfig();
    resetKineticConstraintIds(1);
    const config = getSnakeGameConfig();
    const chain = spawnLinkedBallChain(
        state,
        { col: 10, row: 10 },
        {
            segmentCount: config.segmentCount,
            spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
            segmentRadius: config.startRadius,
            linkSlack: config.linkSlack,
            ballType: config.segmentPropId,
            growDirX: config.growDirX,
            growDirY: config.growDirY,
        },
    );
    wireSnakeGameForHead(state, chain.head.id);
    const goal = spawnGoalOrbAtCell(state, { col: 14, row: 10 });
    const behaviorById = state.sandbox.controller.getBehaviorByIdMap();
    const autosim = createWiredSnakeAutosim(state, { headId: chain.head.id, goalPropId: goal.id, behaviorById, eatRadius: 20, rng: () => 0 });
    autosim.start();
    return {
        goal,
        cameraTarget: chain.head,
        tick(dt) {
            autosim.tick(dt);
        },
        stop() {
            autosim.stop();
        },
    };
}
