import { createExploreIntentState, createFleeIntentState, createSeekIntentState } from "../../AI/agentIntent/intentStates.js";
import { pickFleeCell } from "../../AI/steering/pickFleeCell.js";
import { publishAgentEngagement } from "../../AI/agents/agentEngagement.js";
import { buildAgentDecisionContextIntoFor, createAgentDecisionContextFrame } from "../../AI/agents/gameDecisionContext.js";
import { getAgentProfile, AGENT_PROFILE } from "../../AI/agents/agentProfile.js";
import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { getGroundNavFsmSnapshot } from "./createGroundNavIntentAdapter.js";
import { isSnakeShardFood, isEdibleSnakeFoodForSeeker } from "./snakeFood.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { resolveVisibleCategoryInVision } from "../../AI/perception/agentWorldPerception.js";
import { getPropCategoryIndex } from "../../../GameState/SandboxWorldState.js";
import { createRangedCombatPolicyExtension, createRangedShootIntentState, resetInstanceRangedCombatAction } from "./rangedCombat.js";
import { colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { pickWalkableCell } from "../../Procedural/Mazes/walkableCells.js";
import { pickExploreDestination } from "../../Navigation/steering/exploreSteering.js";
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
    if (instance && profile && hasRangedShootMode(profile) && instance.resolvedWeapon) states.shoot_enemy = createRangedShootIntentState(instance, () => instance.resolvedWeapon);
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
function buildDecisionContextInto(decisionContext, input, deps) {
    const { agent, state, visible, memoryWorld, committed, routeStatus, reachSteps } = input;
    const { resolveHunger, resolveSegmentCount } = deps;
    const instance = deps.agentCtx.instance;
    const profile = instance.profile;
    const profileId = instance.profileId;
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
    const fields = profile.intent.decisionFields ?? {};
    if (fields.seekerFaction) decisionInput.seekerFaction = agent.faction;
    if (fields.seekerSegmentCount) decisionInput.seekerSegmentCount = resolveSegmentCount ? resolveSegmentCount() : null;
    if (fields.session) decisionInput.session = state.sandbox.snakeGame;
    if (profile.weapon || hasRangedShootMode(profile)) {
        decisionInput.agent = agent;
        decisionInput.state = state;
        decisionInput.actionState = instance.combatAction;
        decisionInput.equippedWeapon = instance.equippedWeapon ?? null;
        decisionInput.weaponVisionRange = instance.visionRange.range;
    }
    return buildAgentDecisionContextIntoFor(profileId, decisionContext, decisionInput, { includeScoreDetails: false });
}
function resolveAgentRadius(leader) {
    return getCirclePropRadius(leader);
}
function resolveEatRadiusValue(instance, eatRadius) {
    if (typeof eatRadius === "function") return eatRadius();
    if (eatRadius != null) return eatRadius;
    return instance.eatRadius;
}
function defaultSeekArrivalRadius(profileId, profile, shared, instance, eatRadius) {
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
        return { arrivalRadius: resolveEatRadiusValue(instance, eatRadius), lockOnTarget: true, terminalHoming };
    };
}
function resolveGroundNavIntentDeps(deps) {
    const { state, agentCtx, metabolismApi, metabolism, eatRadius } = deps;
    const instance = deps.instance ?? agentCtx.instance;
    const profile = instance.profile;
    const profileId = instance.profileId;
    const shared = agentCtx.session.config.shared;
    const navWalkable = agentCtx.navWalkable;
    return {
        brain: deps.brain,
        sync: deps.sync,
        headNav: deps.headNav,
        agentCtx,
        visionRange: instance.visionRange,
        visibleSourceResolvers: deps.visibleSourceResolvers ?? buildVisibleSourceResolvers(profile),
        resolveExploreCell: deps.resolveExploreCell ?? ((seeker, gameState, memory, exploreRng) => resolveSnakeExploreCell(seeker, gameState, memory, exploreRng, navWalkable)),
        seekArrivalRadius: deps.seekArrivalRadius ?? defaultSeekArrivalRadius(profileId, profile, shared, instance, eatRadius),
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
function intentMemoryOptions(intent, shared) {
    const base = shared.intentMemory;
    if (!intent.filterAllyForEngagement) return base;
    return { ...base, filterAllyForEngagement: true };
}
function buildAdapterOptions(deps) {
    const { agentCtx, brain, resolveExploreCell, rng, resolveHunger, resolveSegmentCount } = deps;
    const instance = agentCtx.instance;
    const profile = instance.profile;
    const profileId = instance.profileId;
    const intent = profile.intent;
    const shared = agentCtx.session.config.shared;
    const decisionContext = createAgentDecisionContextFrame(profileId);
    const hasRangedShoot = hasRangedShootMode(profile);
    const adapter = {
        reachSlots: intent.reachSlots,
        intentMemoryOptions: intentMemoryOptions(intent, shared),
        config: shared,
        decisionContext,
        buildDecisionContext: (input) => buildDecisionContextInto(decisionContext, input, deps),
        resolveCommittedTarget: (id, world) => resolveCommittedTarget(intent.committedSlots, id, world),
        setFleeDestination: (args) => setFleeDestination(intent, { ...args, navWalkable: agentCtx.navWalkable, config: shared, brain, rng, resolveExploreCell }, profileId),
        sprintConfig: profile.sprint,
        fleeHeldOn: intent.fleeHeldOn,
        clearMemoryOnIntentClear: intent.clearMemoryOnIntentClear,
        transitionReason: transitionReason(intent.seekModes),
        states: createIntentStates(intent.huntMode, instance, profile),
        policyExtensions: hasRangedShoot ? [createRangedCombatPolicyExtension()] : [],
        modeExitDelayTicks: hasRangedShoot ? { flee: 30, shoot_enemy: 15 } : { flee: 30 },
        onIntentClear: hasRangedShoot ? () => resetInstanceRangedCombatAction(instance) : null,
        extendReturn: (returnDeps) => extendReturn(intent, returnDeps),
    };
    if (intent.publishEngagement)
        adapter.afterPerceive = (decisionContext, _agent, state) => {
            publishAgentEngagement(state.sandbox.snakeGame, instance.headId, decisionContext.engagementState);
        };
    return adapter;
}
export function buildGroundNavIntentAdapterOptions(deps) {
    const resolvedDeps = resolveGroundNavIntentDeps(deps);
    return { ...resolvedDeps, ...buildAdapterOptions(resolvedDeps) };
}
const PACK_STEERING_SCRATCH = { packAnchor: { x: 0, y: 0 }, packBlend: 0, maxPackDistCells: 16 };
export function resolvePackSteeringOptions(ctx, profileId = AGENT_PROFILE.flee) {
    const cohesion = getAgentProfile(profileId).factionCohesion ?? {};
    const packBlend = cohesion.fleePackBlend ?? 0;
    if (packBlend <= 0) return null;
    const known = ctx?.known;
    if (!known || (known.allyCount ?? 0) < 1) return null;
    const centroid = known.allyCentroid;
    if (centroid) {
        PACK_STEERING_SCRATCH.packAnchor.x = centroid.x;
        PACK_STEERING_SCRATCH.packAnchor.y = centroid.y;
    } else if (known.ally) {
        PACK_STEERING_SCRATCH.packAnchor.x = known.ally.x;
        PACK_STEERING_SCRATCH.packAnchor.y = known.ally.y;
    } else return null;
    PACK_STEERING_SCRATCH.packBlend = packBlend;
    PACK_STEERING_SCRATCH.maxPackDistCells = cohesion.maxPackDistCells ?? 16;
    return PACK_STEERING_SCRATCH;
}
export function resolveSnakeExploreCell(seeker, state, memory, rng, navWalkable) {
    const shared = getSnakeGameConfig().shared;
    const grid = state.obstacleGrid;
    const col = grid.worldCol(seeker.x);
    const row = grid.worldRow(seeker.y);
    const openCells = navWalkable.cells();
    const explorePick = { memory, openCells, rng };
    let cell = pickExploreDestination(grid, col, row, { ...explorePick, minTiles: shared.exploreMinTiles });
    if (!cell && shared.exploreMinTiles > shared.exploreFallbackMinTiles) cell = pickExploreDestination(grid, col, row, { ...explorePick, minTiles: shared.exploreFallbackMinTiles });
    if (!cell) {
        console.log("[snake] explore destination fell back to random walkable cell");
        cell = pickWalkableCell(openCells, { cols: grid.cols, rng });
    }
    if (cell && cell.col === col && cell.row === row) cell = pickWalkableCell(openCells, { cols: grid.cols, excludeIndices: new Set([colRowToIndex(col, row, grid.cols)]), rng });
    return cell;
}
export { AGENT_PROFILE };
