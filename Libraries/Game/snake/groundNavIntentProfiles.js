import { createExploreIntentState, createFleeIntentState, createSeekIntentState } from "../../AI/agentIntent/intentStates.js";
import { pickFleeCell } from "../../AI/steering/pickFleeCell.js";
import { publishAgentEngagement } from "../../AI/agents/agentEngagement.js";
import { buildAgentDecisionContextIntoFor, createAgentDecisionContextFrame } from "../../AI/agents/gameDecisionContext.js";
import { getAgentProfile, AGENT_PROFILE } from "../../AI/agents/agentProfile.js";
import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { resolvePackSteeringOptions } from "./resolvePackSteeringOptions.js";
import { getGroundNavFsmSnapshot } from "./createGroundNavIntentAdapter.js";
import { isSnakeShardFood, isEdibleSnakeFoodForSeeker } from "./snakeFood.js";
import { resolveSnakeExploreCell } from "./snakeExplore.js";
import { getSharedConfig, getSnakeGameConfig, resolveSnakeEatRadius } from "./snakeGameConfig.js";
import { resolveVisibleCategoryInVision } from "../../AI/perception/agentWorldPerception.js";
import { getPropCategoryIndex } from "../../../GameState/SandboxWorldState.js";
import { createRangedShootIntentState, resetInstanceRangedCombatAction } from "./rangedCombat/rangedShootIntentState.js";
import { resolveRangedWeapon } from "./rangedCombat/resolveRangedWeapon.js";
const ACCEPT_PREDICATES = { edibleFood: isEdibleSnakeFoodForSeeker };
function buildVisibleSourceResolvers(profile) {
    if (!profile.visibleSources) return null;
    const resolvers = {};
    for (const [slotId, config] of Object.entries(profile.visibleSources)) {
        const accept = ACCEPT_PREDICATES[config.accept];
        if (!accept) throw new Error(`Unknown accept predicate: ${config.accept}`);
        const categoryId = config.category;
        resolvers[slotId] = (seeker, state, { frame, visionRange, committedTargetId, targetStickyFactor, vision }) => {
            const index = getPropCategoryIndex(state, categoryId);
            return resolveVisibleCategoryInVision(index, seeker, frame, visionRange, accept, committedTargetId, targetStickyFactor, vision);
        };
    }
    return resolvers;
}
function transitionReason(seekModes) {
    return (prevMode, nextMode, policy) => {
        if (policy?.reason) return policy.reason;
        if (nextMode === "flee") return "threat_visible";
        if (prevMode === "flee") return "threat_clear";
        if (nextMode === "shoot_enemy") return "enemy_in_range";
        if (prevMode === "shoot_enemy" && nextMode !== "shoot_enemy") return "shoot_complete";
        if (seekModes.includes(prevMode) && nextMode !== prevMode) return "target_lost";
        return `mode_${nextMode}`;
    };
}
function hasRangedShootMode(profile) {
    return !!profile.decision?.modes?.shoot_enemy;
}
function createIntentStates(huntMode, instance = null, profile = null) {
    const seek = createSeekIntentState();
    const states = { explore: createExploreIntentState(), seek_food: seek, seek_ally: seek, flee: createFleeIntentState(), [huntMode]: seek };
    if (instance && profile && hasRangedShootMode(profile) && resolveRangedWeapon(instance, profile))
        states.shoot_enemy = createRangedShootIntentState(instance, () => resolveRangedWeapon(instance, profile));
    return states;
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
function buildDecisionContextInto(profileId, decisionContext, input, deps) {
    const { agent, state, visible, memoryWorld, committed, routeStatus, reachSteps } = input;
    const { resolveHunger, resolveSegmentCount } = deps;
    const decisionInput = {
        visibleWorld: visible,
        memoryWorld,
        memorySource: memoryWorld.memorySource,
        committedTarget: committed,
        routeStatus,
        reachSteps,
        cellSize: state.obstacleGrid.cellSize,
        foodFraction: resolveHunger ? resolveHunger() : null,
    };
    const fields = getAgentProfile(profileId).intent.decisionFields ?? {};
    if (fields.seekerFaction) decisionInput.seekerFaction = agent.faction;
    if (fields.seekerSegmentCount) decisionInput.seekerSegmentCount = resolveSegmentCount ? resolveSegmentCount() : null;
    if (fields.session) decisionInput.session = state.sandbox?.snakeGame ?? null;
    const profile = getAgentProfile(profileId);
    if (profile.weapon || hasRangedShootMode(profile)) {
        decisionInput.agent = agent;
        decisionInput.state = state;
        decisionInput.actionState = deps.agentCtx.instance.combatAction;
        decisionInput.equippedWeapon = deps.agentCtx.instance.equippedWeapon ?? null;
    }
    return buildAgentDecisionContextIntoFor(profileId, decisionContext, decisionInput, { includeScoreDetails: false });
}
function resolveAgentRadius(leader) {
    return getCirclePropRadius(leader);
}
function resolveEatRadiusValue(config, instance, eatRadius) {
    if (typeof eatRadius === "function") return eatRadius();
    if (eatRadius != null) return eatRadius;
    return resolveSnakeEatRadius(config, resolveAgentRadius(instance.head));
}
function defaultSeekArrivalRadius(profileId, profile, config, shared, instance, eatRadius) {
    const huntMode = profile.intent?.huntMode ?? "seek_prey";
    const terminalHoming = shared.terminalHoming;
    return (mode, agent, target) => {
        if (mode === "seek_ally") {
            const cohesion = profile.factionCohesion ?? {};
            return { arrivalRadius: cohesion.arrivalRadius ?? (profileId === AGENT_PROFILE.snake ? 32 : 24), lockOnTarget: true, terminalHoming };
        }
        const huntArrival = Math.max(2, resolveAgentRadius(instance.head) * 0.25);
        if (mode === huntMode || mode === "seek_prey" || mode === "seek_enemy" || mode === "shoot_enemy") return { arrivalRadius: huntArrival, lockOnTarget: true, terminalHoming };
        if (!isSnakeShardFood(target)) return { arrivalRadius: huntArrival, lockOnTarget: true, terminalHoming };
        return { arrivalRadius: resolveEatRadiusValue(config, instance, eatRadius), lockOnTarget: true, terminalHoming };
    };
}
function resolveGroundNavIntentDeps(profileId, deps) {
    const config = getSnakeGameConfig();
    const profile = getAgentProfile(profileId, config);
    const shared = getSharedConfig(config);
    const { state, agentCtx, metabolismApi, metabolism, eatRadius } = deps;
    const instance = deps.instance ?? agentCtx.instance;
    const navWalkable = agentCtx.navWalkable;
    return {
        brain: deps.brain,
        sync: deps.sync,
        headNav: deps.headNav,
        agentCtx,
        visionRange: deps.visionRange ?? shared.visionRange,
        visibleSourceResolvers: deps.visibleSourceResolvers ?? buildVisibleSourceResolvers(profile),
        resolveExploreCell: deps.resolveExploreCell ?? ((seeker, gameState, memory, exploreRng) => resolveSnakeExploreCell(seeker, gameState, memory, exploreRng, navWalkable)),
        seekArrivalRadius: deps.seekArrivalRadius ?? defaultSeekArrivalRadius(profileId, profile, config, shared, instance, eatRadius),
        resolveHunger: deps.resolveHunger ?? (metabolismApi && metabolism ? () => metabolismApi.get(metabolism) : null),
        resolveSegmentCount: deps.resolveSegmentCount ?? (state && instance ? () => getConnectedBodyIds(state.kinetic, instance.headId).length : null),
        rng: deps.rng ?? Math.random,
    };
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
    const { intent: intentApi, locomotion, intentMemory, getLastDecisionContext, setTickDt } = deps;
    const api = {
        tick(agent, state, dtMs = 16) {
            setTickDt?.(dtMs);
            intentApi.perceive(agent, state);
            return intentApi.transition(agent, state);
        },
    };
    if (intent.returnShape === "fsmSnapshot")
        api.getFsmSnapshot = (agent, state) => getGroundNavFsmSnapshot({ intent: intentApi, locomotion, agent, state, intentMemory, lastDecisionContext: getLastDecisionContext() });
    return api;
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
    const { agentCtx, brain, resolveExploreCell, rng, resolveHunger, resolveSegmentCount } = deps;
    const instance = agentCtx.instance;
    const decisionContext = createAgentDecisionContextFrame(profileId);
    const hasRangedShoot = hasRangedShootMode(profile);
    const adapter = {
        reachSlots: intent.reachSlots,
        intentMemoryOptions: intentMemoryOptions(profileId, intent, shared),
        config: shared,
        decisionContext,
        buildDecisionContext: (input) => buildDecisionContextInto(profileId, decisionContext, input, deps),
        resolveCommittedTarget: (id, world) => resolveCommittedTarget(intent.committedSlots, id, world),
        setFleeDestination: (args) => setFleeDestination(intent, { ...args, navWalkable: agentCtx.navWalkable, config: shared, brain, rng, resolveExploreCell }, profileId),
        sprintConfig: profile.sprint,
        fleeHeldOn: intent.fleeHeldOn,
        clearMemoryOnIntentClear: intent.clearMemoryOnIntentClear,
        transitionReason: transitionReason(intent.seekModes),
        states: createIntentStates(intent.huntMode, instance, profile),
        useShootPolicyLatch: hasRangedShoot,
        modeExitDelayTicks: hasRangedShoot ? { flee: 30, shoot_enemy: 15 } : { flee: 30 },
        onIntentClear: hasRangedShoot ? () => resetInstanceRangedCombatAction(instance) : null,
        extendReturn: (returnDeps) => extendReturn(intent, returnDeps),
    };
    if (intent.publishEngagement)
        adapter.afterPerceive = (decisionContext, _agent, state) => {
            const snakeGame = state.sandbox?.snakeGame;
            if (snakeGame) publishAgentEngagement(snakeGame, agentCtx.instance.headId, decisionContext.engagementState);
        };
    return adapter;
}
export function buildGroundNavIntentAdapterOptions(profileId, deps) {
    if (!getSnakeGameConfig().agentProfiles?.[profileId]) throw new Error(`unknown ground nav intent profile: ${profileId}`);
    const resolvedDeps = resolveGroundNavIntentDeps(profileId, deps);
    return { ...resolvedDeps, ...buildAdapterOptions(profileId, resolvedDeps) };
}
export { AGENT_PROFILE };
