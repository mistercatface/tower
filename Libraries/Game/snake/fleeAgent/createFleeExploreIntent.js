import { createExploreIntentState, createFleeIntentState, createSeekIntentState } from "../../../AI/agentIntent/intentStates.js";
import { pickFleeCell } from "../../../AI/steering/pickFleeCell.js";
import { buildFleeDecisionContext, deriveFleeSprintIntent } from "./fleeDecisionModel.js";
import { resolveFleePackOptions } from "./resolveFleePackOptions.js";
import { createGroundNavIntentAdapter } from "../createGroundNavIntentAdapter.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
const FLEE_REACH_SLOTS = {
    threat: { targetKey: "threat", mode: "flee" },
    enemy: { targetKey: "prey", mode: "seek_enemy" },
    food: { targetKey: "food", mode: "seek_food" },
    ally: { targetKey: "ally", mode: "seek_ally" },
};
export function createFleeExploreIntent({
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
        rng,
        config,
        intentMemoryOptions: config.intentMemory,
        reachSlots: FLEE_REACH_SLOTS,
        buildDecisionContext: ({ state, memoryWorld, committed, routeStatus, reachSteps }) =>
            buildFleeDecisionContext({
                visibleWorld: memoryWorld,
                memoryWorld,
                memorySource: memoryWorld.memorySource,
                committedTarget: committed,
                routeStatus,
                reachSteps,
                cellSize: state.obstacleGrid.cellSize,
                foodFraction: resolveHunger ? resolveHunger() : null,
            }),
        formatPerceiveWorld(decisionContext, memoryWorld) {
            return { ...memoryWorld, decisionContext };
        },
        resolveCommittedTarget(id, world) {
            if (id == null) return null;
            const known = world.decisionContext.known;
            if (known.food?.id === id) return known.food;
            if (known.enemy?.id === id) return known.enemy;
            if (known.ally?.id === id) return known.ally;
            return null;
        },
        setFleeDestination({ agent, state, world, avoidCell, locomotion }) {
            const threat = world.decisionContext.known.threat;
            if (!threat) return null;
            const packOptions = resolveFleePackOptions(world.decisionContext);
            const cell = pickFleeCell(agent, threat, state.obstacleGrid, navWalkable, config.fleeTiles, avoidCell, packOptions);
            if (cell) {
                locomotion.setFlee(agent, state, cell);
                return cell;
            }
            const exploreCell = resolveExploreCell(agent, state, brain.spatial, rng);
            if (exploreCell) locomotion.setExplore(agent, state, exploreCell);
            return exploreCell;
        },
        deriveSprintIntent: (mode, ctx) => deriveFleeSprintIntent(mode, ctx.threatState, ctx.hungerTier),
        clearMemoryOnIntentClear: true,
        transitionReason(prevMode, nextMode, policy) {
            if (policy?.reason) return policy.reason;
            if (nextMode === "flee") return "threat_visible";
            if (prevMode === "flee") return "threat_clear";
            if ((prevMode === "seek_enemy" || prevMode === "seek_food") && nextMode !== prevMode) return "target_lost";
            if (prevMode === "seek_ally" && nextMode !== prevMode) return "target_lost";
            return `mode_${nextMode}`;
        },
        states: { explore: createExploreIntentState(), seek_enemy: createSeekIntentState(), seek_food: createSeekIntentState(), seek_ally: createSeekIntentState(), flee: createFleeIntentState() },
        extendReturn({ intent, intentMemory }) {
            return {
                tick(agent, state) {
                    intent.perceive(agent, state);
                    return intent.transition(agent, state);
                },
                clearIntent(agent, state) {
                    intent.clear(agent, state);
                    intentMemory.clear();
                },
            };
        },
    });
}
