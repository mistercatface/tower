import { createExploreIntentState, createFleeIntentState, createSeekIntentState } from "../../AI/agentIntent/intentStates.js";
import { pickFleeCell } from "../../AI/steering/pickFleeCell.js";
import { publishAgentEngagement } from "../../AI/agents/agentEngagement.js";
import { buildAgentDecisionContextFor } from "../../AI/agents/gameDecisionContext.js";
import { getAgentProfile, AGENT_PROFILE } from "../../AI/agents/agentProfile.js";
import { resolvePackSteeringOptions } from "./resolvePackSteeringOptions.js";
import { createGroundNavIntentAdapter, getGroundNavFsmSnapshot } from "./createGroundNavIntentAdapter.js";
import { getSharedConfig, getSnakeGameConfig } from "./snakeGameConfig.js";
function transitionReason(seekModes) {
    return (prevMode, nextMode, policy) => {
        if (policy?.reason) return policy.reason;
        if (nextMode === "flee") return "threat_visible";
        if (prevMode === "flee") return "threat_clear";
        if (seekModes.includes(prevMode) && nextMode !== prevMode) return "target_lost";
        return `mode_${nextMode}`;
    };
}
function createIntentStates(huntMode) {
    const seek = createSeekIntentState();
    return { explore: createExploreIntentState(), seek_food: seek, seek_ally: seek, flee: createFleeIntentState(), [huntMode]: seek };
}
function resolveCommittedTarget(committedSlots, id, world) {
    if (id == null) return null;
    const known = world.decisionContext.known;
    for (let i = 0; i < committedSlots.length; i++) {
        const target = known[committedSlots[i]];
        if (target?.id === id) return target;
    }
    return null;
}
function buildDecisionInput(profileId, intent, input, deps) {
    const { agent, state, visible, memoryWorld, committed, routeStatus, reachSteps } = input;
    const { resolveHunger, resolveSegmentCount } = deps;
    const decisionInput = {
        visibleWorld: intent.perceiveSource === "memory" ? memoryWorld : visible,
        memoryWorld,
        memorySource: memoryWorld.memorySource,
        committedTarget: committed,
        routeStatus,
        reachSteps,
        cellSize: state.obstacleGrid.cellSize,
        foodFraction: resolveHunger ? resolveHunger() : null,
    };
    const fields = intent.decisionFields ?? {};
    if (fields.seekerFaction) decisionInput.seekerFaction = agent.faction;
    if (fields.seekerSegmentCount) decisionInput.seekerSegmentCount = resolveSegmentCount ? resolveSegmentCount() : null;
    if (fields.session) decisionInput.session = state.sandbox?.snakeGame ?? null;
    return buildAgentDecisionContextFor(profileId, decisionInput);
}
function setFleeDestination(intent, args, profileId) {
    const { agent, state, world, avoidCell, locomotion, navWalkable, config, brain, rng, resolveExploreCell } = args;
    const threat = world.decisionContext.known.threat;
    if (!threat) return null;
    const packOptions = intent.fleePackBlend ? resolvePackSteeringOptions(world.decisionContext, profileId) : null;
    const cell = pickFleeCell(agent, threat, state.obstacleGrid, navWalkable, config.fleeTiles, avoidCell, packOptions);
    if (cell) {
        locomotion.setFlee(agent, state, cell);
        return cell;
    }
    if (intent.fleeExploreFallback) {
        const exploreCell = resolveExploreCell(agent, state, brain.spatial, rng);
        if (exploreCell) locomotion.setExplore(agent, state, exploreCell);
        return exploreCell;
    }
    return null;
}
function extendReturn(intent, deps) {
    if (intent.returnShape === "fsmSnapshot") {
        const { intent: intentApi, locomotion, intentMemory, getLastDecisionContext } = deps;
        return {
            getFsmSnapshot(agent, state) {
                return getGroundNavFsmSnapshot({ intent: intentApi, locomotion, agent, state, intentMemory, lastDecisionContext: getLastDecisionContext() });
            },
        };
    }
    const { intent: intentApi, intentMemory } = deps;
    return {
        tick(agent, state) {
            intentApi.perceive(agent, state);
            return intentApi.transition(agent, state);
        },
        clearIntent(agent, state) {
            intentApi.clear(agent, state);
            intentMemory.clear();
        },
    };
}
function intentMemoryOptions(profileId, intent, shared) {
    const base = shared.intentMemory;
    if (!intent.filterAllyForEngagement) return base;
    return { ...base, filterAllyForEngagement: true };
}
function buildAdapterOptions(profileId, deps) {
    const profile = getAgentProfile(profileId);
    const intent = profile.intent;
    const shared = getSharedConfig();
    const { selfHeadId, brain, resolveExploreCell, rng, resolveHunger, resolveSegmentCount } = deps;
    const adapter = {
        reachSlots: intent.reachSlots,
        intentMemoryOptions: intentMemoryOptions(profileId, intent, shared),
        config: shared,
        buildDecisionContext: (input) => buildDecisionInput(profileId, intent, input, deps),
        resolveCommittedTarget: (id, world) => resolveCommittedTarget(intent.committedSlots, id, world),
        setFleeDestination: (args) => setFleeDestination(intent, { ...args, navWalkable: deps.navWalkable, config: shared, brain, rng, resolveExploreCell }, profileId),
        sprintConfig: profile.sprint,
        fleeHeldOn: intent.fleeHeldOn,
        clearMemoryOnIntentClear: intent.clearMemoryOnIntentClear,
        transitionReason: transitionReason(intent.seekModes),
        states: createIntentStates(intent.huntMode),
        extendReturn: (returnDeps) => extendReturn(intent, returnDeps),
    };
    if (intent.publishEngagement)
        adapter.afterPerceive = (decisionContext, _agent, state) => {
            const snakeGame = state.sandbox?.snakeGame;
            if (snakeGame) publishAgentEngagement(snakeGame, selfHeadId, decisionContext.engagementState);
        };
    if (intent.attachDecisionToPerceiveWorld) adapter.formatPerceiveWorld = (decisionContext, memoryWorld) => ({ ...memoryWorld, decisionContext });
    return adapter;
}
export function buildGroundNavIntentAdapterOptions(profileId, deps) {
    if (!getSnakeGameConfig().agentProfiles?.[profileId]) throw new Error(`unknown ground nav intent profile: ${profileId}`);
    return buildAdapterOptions(profileId, deps);
}
export { AGENT_PROFILE };
