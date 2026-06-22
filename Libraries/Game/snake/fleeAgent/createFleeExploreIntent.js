import { createAgentIntent } from "../../../AI/agentIntent/createAgentIntent.js";
import { createExploreIntentState, createFleeIntentState } from "../../../AI/agentIntent/intentStates.js";
import { createModePolicyLatch } from "../../../AI/agentIntent/policyHysteresis.js";
import { pickFleeCell } from "../../../AI/steering/pickFleeCell.js";
import { createCellTargetLocomotion } from "../../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { perceiveSnakeIntentWorld } from "../snakeIntent.js";
export function createFleeExploreIntent({ brain, sync, headNav, resolveExploreCell, selfHeadId, registry, navWalkable, visionCone = null, rng = Math.random }) {
    const config = getSnakeGameConfig();
    const resolvedVision = visionCone ?? config.visionCone;
    const locomotion = createCellTargetLocomotion(headNav);
    const fleeHysteresis = config.fleeHysteresis;
    const fleeLatch = createModePolicyLatch({
        mode: "flee",
        minTicks: fleeHysteresis.minTicks,
        holdReason: "flee_hysteresis",
        refreshWhen: ({ world }) => !!world.threat,
        canRelease: ({ world }) => !world.threat,
    });
    let intent = null;
    let lastArrivalCol = null;
    let lastArrivalRow = null;
    const stampArrivalOnCellEnter = (agent, grid) => {
        const { col, row } = grid.worldToGrid(agent.x, agent.y);
        if (col === lastArrivalCol && row === lastArrivalRow) return;
        lastArrivalCol = col;
        lastArrivalRow = row;
        brain.stampArrival(col, row);
    };
    const perceiveFleeWorld = (agent, state) => {
        const visible = perceiveSnakeIntentWorld(agent, selfHeadId, state, registry, () => null, resolvedVision);
        const threat = visible.threat;
        return { threat, blackboard: { facts: { known: { threat } } } };
    };
    const createFleeEffects = ({ agent, state, world }) => ({
        clearDestination() {
            locomotion.clearDestination(agent, state);
        },
        setExploreDestination() {
            const cell = resolveExploreCell(agent, state, brain.spatial, rng);
            if (cell) locomotion.setExplore(agent, state, cell);
            return cell;
        },
        setFleeDestination(avoidCell = null) {
            const threat = world.blackboard.facts.known.threat;
            if (!threat) return null;
            const cell = pickFleeCell(agent, threat, state.obstacleGrid, navWalkable, config.fleeTiles, avoidCell);
            if (cell) {
                locomotion.setFlee(agent, state, cell);
                return cell;
            }
            const exploreCell = resolveExploreCell(agent, state, brain.spatial, rng);
            if (exploreCell) locomotion.setExplore(agent, state, exploreCell);
            return exploreCell;
        },
    });
    const createFleeContext = (ctx) => ({ ...ctx, grid: ctx.state.obstacleGrid, dest: locomotion.getDestination(), fleeTarget: ctx.world.blackboard.facts.known.threat, locomotion });
    intent = createAgentIntent({
        initialMode: "explore",
        sync(agent, state) {
            sync(agent, state);
            stampArrivalOnCellEnter(agent, state.obstacleGrid);
        },
        perceiveWorld: perceiveFleeWorld,
        pickPolicy: (world) => {
            const policy = world.threat ? { mode: "flee", targetId: null, reason: "threat_visible" } : { mode: "explore", targetId: null, reason: "patrol" };
            return fleeLatch.apply(policy, { world, currentMode: intent.getMode() });
        },
        transitionReason: (prevMode, nextMode, policy) => {
            if (policy?.reason) return policy.reason;
            if (nextMode === "flee") return "threat_visible";
            if (prevMode === "flee") return "threat_clear";
            return `mode_${nextMode}`;
        },
        states: { explore: createExploreIntentState(), flee: createFleeIntentState() },
        createEffects: createFleeEffects,
        createContext: createFleeContext,
        onClear(agent, state) {
            lastArrivalCol = null;
            lastArrivalRow = null;
            fleeLatch.clear();
            locomotion.clear(agent, state);
            if (agent) agent.navStepPenalty = null;
        },
        onResetMode(agent, state) {
            lastArrivalCol = null;
            lastArrivalRow = null;
            fleeLatch.clear();
            locomotion.clearDestination(agent, state);
        },
    });
    return {
        ...intent,
        headId: selfHeadId,
        headNav,
        getDestination() {
            return locomotion.getDestination();
        },
        tick(agent, state) {
            intent.perceive(agent, state);
            return intent.transition(agent, state);
        },
        clearIntent(agent, state) {
            intent.clear(agent, state);
        },
    };
}
