import { createExploreIntentState, createFleeIntentState, createSeekIntentState } from "../../AI/agentIntent/intentStates.js";
import { pickFleeCell } from "../../AI/steering/pickFleeCell.js";
import { publishAgentEngagement } from "../../AI/agents/agentEngagement.js";
import { buildAgentDecisionContextFor, AGENT_DECISION_PROFILE } from "../../AI/agents/gameDecisionContext.js";
import { createGroundNavIntentAdapter, getGroundNavFsmSnapshot } from "./createGroundNavIntentAdapter.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
const SNAKE_REACH_SLOTS = {
    threat: { targetKey: "threat", mode: "flee" },
    prey: { targetKey: "prey", mode: "seek_prey" },
    food: { targetKey: "food", mode: "seek_food" },
    ally: { targetKey: "ally", mode: "seek_ally" },
};
export function createSnakeForageIntent({
    brain,
    sync,
    headNav,
    resolveVisibleFood,
    resolveExploreCell,
    selfHeadId,
    registry,
    navWalkable,
    visionRange = null,
    seekArrivalRadius = null,
    resolveHunger = null,
    resolveSegmentCount = null,
    rng = Math.random,
}) {
    const config = getSnakeGameConfig();
    return createGroundNavIntentAdapter({
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
        resolveSegmentCount,
        rng,
        config,
        intentMemoryOptions: { ...config.intentMemory, filterAllyForEngagement: true },
        reachSlots: SNAKE_REACH_SLOTS,
        buildDecisionContext: ({ agent, state, visible, memoryWorld, committed, routeStatus, reachSteps }) =>
            buildAgentDecisionContextFor(AGENT_DECISION_PROFILE.snake, {
                visibleWorld: visible,
                memoryWorld,
                memorySource: memoryWorld.memorySource,
                committedTarget: committed,
                routeStatus,
                reachSteps,
                cellSize: state.obstacleGrid.cellSize,
                foodFraction: resolveHunger ? resolveHunger() : null,
                seekerFaction: agent.faction,
                seekerSegmentCount: resolveSegmentCount ? resolveSegmentCount() : null,
                session: state.sandbox?.snakeGame ?? null,
            }),
        afterPerceive(decisionContext, agent, state) {
            const snakeGame = state.sandbox?.snakeGame;
            if (snakeGame) publishAgentEngagement(snakeGame, selfHeadId, decisionContext.engagementState);
        },
        resolveCommittedTarget(id, world) {
            if (id == null) return null;
            const known = world.decisionContext.known;
            if (known.prey?.id === id) return known.prey;
            if (known.food?.id === id) return known.food;
            if (known.ally?.id === id) return known.ally;
            return null;
        },
        setFleeDestination({ agent, state, world, avoidCell, locomotion }) {
            const threat = world.decisionContext.known.threat;
            if (!threat) return null;
            const cell = pickFleeCell(agent, threat, state.obstacleGrid, navWalkable, config.fleeTiles, avoidCell);
            if (cell) locomotion.setFlee(agent, state, cell);
            return cell;
        },
        sprintConfig: config.sprint,
        fleeHeldOn: "any",
        transitionReason(prevMode, nextMode, policy) {
            if (policy?.reason) return policy.reason;
            if (nextMode === "flee") return "threat_visible";
            if (prevMode === "flee") return "threat_clear";
            if ((prevMode === "seek_food" || prevMode === "seek_prey" || prevMode === "seek_ally") && nextMode !== prevMode) return "target_lost";
            return `mode_${nextMode}`;
        },
        states: { explore: createExploreIntentState(), seek_food: createSeekIntentState(), seek_prey: createSeekIntentState(), seek_ally: createSeekIntentState(), flee: createFleeIntentState() },
        extendReturn({ intent, locomotion, intentMemory, getLastDecisionContext }) {
            return {
                getFsmSnapshot(agent, state) {
                    return getGroundNavFsmSnapshot({ intent, locomotion, agent, state, intentMemory, lastDecisionContext: getLastDecisionContext() });
                },
            };
        },
    });
}
