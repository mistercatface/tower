import { createAgentIntent } from "../../AI/agentIntent/createAgentIntent.js";
import { createBrainArrivalStamper } from "../../AI/agentIntent/createBrainArrivalStamper.js";
import { createCellTargetIntentContext, createCellTargetIntentEffects } from "../../AI/agentIntent/createCellTargetIntentEffects.js";
import { applyFleePolicyLatch, createFleeIntentLatch } from "../../AI/agentIntent/createFleeIntentLatch.js";
import { readAgentRouteStatus } from "../../AI/agentIntent/readAgentRouteStatus.js";
import { createAgentIntentMemory } from "../../AI/memory/createAgentIntentMemory.js";
import { syncNavReachHorizon } from "../../Navigation/navReachHorizon.js";
import { createCellTargetLocomotion } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { buildAgentReachSteps } from "./agentReachSteps.js";
import { perceiveAgentIntentWorld } from "./agentIntentPerception.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
export function createGroundNavIntentAdapter({
    brain,
    sync,
    headNav,
    resolveVisibleFood,
    resolveExploreCell,
    selfHeadId,
    registry,
    navWalkable,
    visionRange,
    seekArrivalRadius,
    resolveHunger,
    resolveSegmentCount = null,
    rng = Math.random,
    config,
    intentMemoryOptions,
    reachSlots,
    buildDecisionContext,
    formatPerceiveWorld = (decisionContext) => decisionContext,
    afterPerceive = null,
    resolveCommittedTarget,
    setFleeDestination,
    deriveSprintIntent,
    fleeHeldOn = "flee",
    clearMemoryOnIntentClear = false,
    onIntentClear = null,
    transitionReason,
    states,
    modeExitDelayTicks = { flee: 30 },
    extendReturn = () => ({}),
}) {
    const resolvedVision = visionRange ?? config.visionRange;
    const locomotion = createCellTargetLocomotion(headNav);
    const intentMemory = createAgentIntentMemory(intentMemoryOptions);
    const fleeLatch = createFleeIntentLatch(config);
    const arrivalStamper = createBrainArrivalStamper(brain);
    let intent = null;
    let lastBlackboard = null;
    let lastDecisionSnapshot = null;
    const perceiveWithMemory = (agent, state) => {
        const visible = perceiveAgentIntentWorld(agent, selfHeadId, state, registry, resolveVisibleFood, resolvedVision);
        intentMemory.update(agent, state, visible);
        const memoryWorld = intentMemory.enrichWorld(state, visible);
        const nav = requireSnakeVisionFrame(state).navTopology;
        syncNavReachHorizon(nav, agent.x, agent.y, config.decisionReachHorizon ?? 32);
        const committed = intent ? { mode: intent.getMode(), targetId: intent.getTargetId() } : null;
        const routeStatus = readAgentRouteStatus(locomotion, agent, state);
        const reachSteps = buildAgentReachSteps(memoryWorld, committed, routeStatus, reachSlots);
        const decisionContext = buildDecisionContext({ agent, state, visible, memoryWorld, committed, routeStatus, reachSteps });
        afterPerceive?.(decisionContext, agent, state);
        lastBlackboard = decisionContext.blackboard;
        lastDecisionSnapshot = decisionContext.decisionSnapshot;
        return formatPerceiveWorld(decisionContext, memoryWorld);
    };
    const resetArrivalAndLatch = () => {
        arrivalStamper.reset();
        fleeLatch.clear();
    };
    intent = createAgentIntent({
        initialMode: "explore",
        sync(agent, state) {
            sync(agent, state);
            arrivalStamper.stamp(agent, state.obstacleGrid);
        },
        perceiveWorld: perceiveWithMemory,
        pickPolicy: (world) => applyFleePolicyLatch({ world, fleeLatch, currentMode: intent?.getMode(), deriveSprintIntent, fleeHeldOn }),
        transitionReason,
        states,
        modeExitDelayTicks,
        createEffects: createCellTargetIntentEffects({ locomotion, resolveExploreCell, brain, rng, seekArrivalRadius, setFleeDestination }),
        createContext: createCellTargetIntentContext({ locomotion, resolveCommittedTarget }),
        onClear(agent, state) {
            resetArrivalAndLatch();
            if (clearMemoryOnIntentClear) intentMemory.clear();
            onIntentClear?.();
            locomotion.clear(agent, state);
            if (agent) agent.navStepPenalty = null;
        },
        onResetMode(agent, state) {
            resetArrivalAndLatch();
            locomotion.clearDestination(agent, state);
        },
    });
    const base = {
        ...intent,
        headId: selfHeadId,
        headNav,
        getDestination() {
            return locomotion.getDestination();
        },
        getDecisionSnapshot() {
            return lastDecisionSnapshot;
        },
        getIntentMemorySnapshot() {
            return intentMemory.snapshot();
        },
        resetMemory() {
            brain.clearMemory();
            intentMemory.clear();
        },
        clear(agent, state) {
            intent.clear(agent, state);
            intentMemory.clear();
        },
        clearTrackedGoal() {
            const id = intent.getTargetId();
            intent.clearTargetId();
            if (id != null) intentMemory.clearTarget(id);
        },
        resetMode() {
            intent.resetMode(null, null);
        },
        hasMoveTarget() {
            return locomotion.hasMoveTarget(null, null);
        },
    };
    return { ...base, ...extendReturn({ intent, locomotion, intentMemory, getLastBlackboard: () => lastBlackboard, getLastDecisionSnapshot: () => lastDecisionSnapshot }) };
}
