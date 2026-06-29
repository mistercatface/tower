import { pushTargetEvents, routeEventsInto, intentPolicy, intentPolicyInto, policyReasonForTarget } from "../agentIntent/AgentIntent.js";
import {
    pickBestScoreKey,
    pickBestScoreKeyInto,
    scoreCandidateNetsInto,
    scoreCandidateSet,
    scoreCandidateSetInto,
    costPerCellForHunger,
    foodHungerScoreValue,
    netScoreDetail,
    netScoreOnly,
    resetScoreDetailScratch,
    SCORE_ABSENT,
    scoreRiskAdjustedFlee,
} from "../utility/utilityScoring.js";
import { AGENT_PROFILE, getAgentProfile, isAgentEngaged, readAgentEngagement } from "./AgentProfiles.js";
import { deriveRangedCombatStateInto } from "../../Game/snake/GroundNavIntentAdapter.js";
// === From bandFromThresholds.js ===
/** @param {number | null | undefined} value @param {{ id: string, min: number }[]} bands highest `min` first */
export function bandFromThresholds(value, bands) {
    if (value == null || !bands?.length) return null;
    for (let i = 0; i < bands.length; i++) if (value >= bands[i].min) return bands[i].id;
    return bands[bands.length - 1].id;
}
export function lookupBandTable(table, bandId, fallbackBandId = "hungry") {
    const key = bandId ?? fallbackBandId;
    if (table[key] != null) return table[key];
    return table[fallbackBandId] ?? 0;
}
export const DEFAULT_HUNGER_BANDS = Object.freeze([
    { id: "satisfied", min: 0.66 },
    { id: "hungry", min: 0.33 },
    { id: "desperate", min: 0 },
]);
// === From buildAgentRemembered.js ===
/** @typedef {{ key: string, memoryKey?: string, allyCount?: number, constant?: null }} AgentRememberedSlot */
export function buildAgentRememberedInto(remembered, memoryWorld, memorySource, slots) {
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const { key, memoryKey = key } = slot;
        if (Object.hasOwn(slot, "constant")) {
            remembered[key] = slot.constant;
            continue;
        }
        if (slot.allyCount != null) {
            remembered[key] = memorySource?.[memoryKey] ? (memoryWorld?.allyCount ?? slot.allyCount) : 0;
            continue;
        }
        remembered[key] = memorySource?.[memoryKey] ? (memoryWorld?.[memoryKey] ?? null) : null;
    }
    return remembered;
}
export function buildAgentRemembered(memoryWorld, memorySource, slots) {
    return buildAgentRememberedInto({}, memoryWorld, memorySource, slots);
}
// === From deriveAllyState.js ===
export function deriveAllyStateInto(out, visibleWorld, known, memorySource = null, session = null, allyReachSteps = null) {
    const visibleAlly = memorySource?.ally ? null : visibleWorld?.ally;
    const knownAlly = known?.ally ?? null;
    out.ally = knownAlly;
    out.dist = allyReachSteps ?? null;
    out.count = known?.allyCount ?? 0;
    out.centroid = visibleAlly ? (visibleWorld.allyCentroid ?? null) : null;
    out.visible = !!visibleAlly;
    out.remembered = !!memorySource?.ally && !!knownAlly;
    out.engagement = knownAlly && session ? readAgentEngagement(session, knownAlly.id) : null;
    out.leadworthy = !!knownAlly && (!session || isAgentEngaged(session, knownAlly.id));
    return out;
}
export function deriveAllyState(visibleWorld, known, memorySource = null, session = null, allyReachSteps = null) {
    return deriveAllyStateInto(
        { ally: null, dist: null, count: 0, centroid: null, visible: false, remembered: false, engagement: null, leadworthy: false },
        visibleWorld,
        known,
        memorySource,
        session,
        allyReachSteps,
    );
}
// === From mergeSlotsFromSchema.js ===
function resolveEngagedAlly(visibleWorld, remembered, input) {
    let ally = visibleWorld.ally;
    const session = input.session ?? null;
    if (ally && session && !isAgentEngaged(session, ally.id)) ally = null;
    const memorySource = input.memoryWorld?.memorySource ?? null;
    if (!ally && memorySource?.ally) ally = input.memoryWorld?.ally ?? remembered.ally ?? null;
    if (ally && session && !isAgentEngaged(session, ally.id)) ally = null;
    return ally;
}
function mergeKnownSlot(slotKey, slotDef, visible, remembered, visibleWorld, input) {
    const merge = slotDef.known ?? "worldOrRemembered";
    if (merge === "engagedAlly") return resolveEngagedAlly(visibleWorld, remembered, input);
    if (merge === "visibleOrRemembered") return visible[slotKey] ?? remembered[slotKey] ?? null;
    return visibleWorld[slotKey] ?? remembered[slotKey] ?? null;
}
function visibleSlotValue(slotKey, slotDef, visibleWorld, memorySource) {
    const memoryKey = slotDef.memoryKey ?? slotKey;
    if (slotDef.hideVisibleWhenMemory && memorySource?.[memoryKey]) return null;
    return visibleWorld[slotDef.visibleFrom ?? slotKey] ?? null;
}
function copyVisibleField(fieldDef, visibleWorld, memorySource) {
    if (fieldDef.ifMemory && memorySource?.[fieldDef.ifMemory.key]) return fieldDef.ifMemory.use;
    return visibleWorld[fieldDef.from] ?? fieldDef.default ?? null;
}
function copyKnownField(fieldDef, visible, remembered, visibleWorld, known) {
    if (fieldDef.fromVisible != null && fieldDef.visibleIfSlot == null && fieldDef.anchorSlot == null) return visible[fieldDef.fromVisible] ?? fieldDef.default ?? null;
    if (fieldDef.visibleIfSlot != null)
        return visible[fieldDef.visibleIfSlot] ? (visible[fieldDef.fromVisible] ?? remembered[fieldDef.fromRemembered] ?? null) : (remembered[fieldDef.fromRemembered] ?? null);
    if (fieldDef.anchorSlot != null) {
        const anchor = known[fieldDef.anchorSlot];
        if (!anchor) return fieldDef.whenMissing ?? null;
        const worldTarget = visibleWorld[fieldDef.matchWorldSlot];
        if (worldTarget?.id !== anchor.id) {
            if (Object.hasOwn(fieldDef, "whenNoMatch")) return fieldDef.whenNoMatch;
            return remembered[fieldDef.fromRemembered] ?? null;
        }
        return visible[fieldDef.fromVisible] ?? null;
    }
    return visibleWorld[fieldDef.from] ?? remembered[fieldDef.from] ?? fieldDef.default ?? null;
}
export function mergeSlotsFromSchemaInto(frame, schema, input) {
    const visibleWorld = input.visibleWorld;
    const memoryWorld = input.memoryWorld ?? null;
    const memorySource = memoryWorld?.memorySource ?? null;
    buildAgentRememberedInto(frame.remembered, memoryWorld, memorySource, schema.remembered);
    const slotKeys = schema.compiledSlots ?? Object.keys(schema.slots);
    for (let i = 0; i < slotKeys.length; i++) {
        const slotKey = slotKeys[i];
        frame.visible[slotKey] = visibleSlotValue(slotKey, schema.slots[slotKey], visibleWorld, memorySource);
    }
    const fieldEntries = schema.compiledFieldsEntries ?? (schema.fields ? Object.entries(schema.fields) : []);
    for (let i = 0; i < fieldEntries.length; i++) {
        const [fieldKey, fieldDef] = fieldEntries[i];
        if (fieldDef.visible != null) frame.visible[fieldKey] = copyVisibleField(fieldDef.visible, visibleWorld, memorySource);
    }
    const slotEntries = schema.compiledSlotsEntries ?? Object.entries(schema.slots);
    for (let i = 0; i < slotEntries.length; i++) {
        const [slotKey, slotDef] = slotEntries[i];
        frame.known[slotKey] = mergeKnownSlot(slotKey, slotDef, frame.visible, frame.remembered, visibleWorld, input);
    }
    for (let i = 0; i < fieldEntries.length; i++) {
        const [fieldKey, fieldDef] = fieldEntries[i];
        if (fieldDef.known != null) frame.known[fieldKey] = copyKnownField(fieldDef.known, frame.visible, frame.remembered, visibleWorld, frame.known);
    }
    return frame;
}
export function mergeSlotsFromSchema(schema, visibleWorld, memoryWorld, memorySource, input) {
    const frame = { visible: {}, remembered: {}, known: {} };
    return mergeSlotsFromSchemaInto(frame, schema, { visibleWorld, memoryWorld, memorySource, ...input });
}
// === From deriveSprintIntent.js ===
const SPRINT_RULES = {
    always: () => true,
    severeOrLethalThreat(ctx, sprintConfig) {
        const threat = ctx.threatState;
        if (!threat) return false;
        return threat.lethal || threat.severity >= sprintConfig.fleeSeverity;
    },
    severeNonLethalThreat(ctx, sprintConfig) {
        const threat = ctx.threatState;
        if (!threat || threat.lethal) return false;
        return threat.severity >= sprintConfig.fleeSeverity;
    },
};
function guardBlocks(guardId, ctx, sprintConfig) {
    if (guardId === "minHunger") {
        const min = sprintConfig.sprintFleeMinHunger ?? 0.1;
        const fraction = ctx.foodFraction ?? 1;
        if (fraction < min) return "starving";
    }
    if (guardId === "bandDesperate" && ctx.hungerTier !== "desperate") return "none";
    return null;
}
function passesGuards(guards, ctx, sprintConfig) {
    if (!guards?.length) return null;
    for (let i = 0; i < guards.length; i++) {
        const blocked = guardBlocks(guards[i], ctx, sprintConfig);
        if (blocked) return blocked;
    }
    return null;
}
export function deriveSprintIntentInto(out, mode, ctx, sprintConfig) {
    const rules = sprintConfig?.rules;
    if (!rules?.length) {
        out.want = false;
        out.reason = "none";
        return out;
    }
    for (let i = 0; i < rules.length; i++) {
        const row = rules[i];
        if (row.mode !== mode) continue;
        const blockedReason = passesGuards(row.guards, ctx, sprintConfig);
        if (blockedReason) {
            out.want = false;
            out.reason = blockedReason;
            return out;
        }
        const ruleFn = SPRINT_RULES[row.rule];
        if (!ruleFn?.(ctx, sprintConfig)) continue;
        out.want = row.want ?? true;
        out.reason = row.reason ?? "none";
        return out;
    }
    out.want = false;
    out.reason = "none";
    return out;
}
export class PolicyLatchState {
    constructor() {
        this.mode = null;
        this.active = false;
        this.ticksRemaining = 0;
    }
    copyFrom(other) {
        this.mode = other.mode;
        this.active = other.active;
        this.ticksRemaining = other.ticksRemaining;
        return this;
    }
}
// === From scoreDecisionModes.js ===
const GUARDS = {
    notSatisfied: (ctx) => ctx.hungerTier === "satisfied",
    noThreat: (ctx) => !!ctx.known.threat,
    notDesperate: (ctx) => ctx.hungerTier === "desperate",
    requiresLeadworthy: (ctx) => !ctx.allyState?.leadworthy,
    requiresSatisfied: (ctx) => ctx.hungerTier !== "satisfied",
    preyTooFar: (ctx, modeDef) => {
        const slot = modeDef?.slot ?? "prey";
        const prey = ctx.known[slot];
        if (!prey) return false;
        const reach = ctx.reachSteps?.[slot];
        const max = modeDef?.maxPreyReach ?? 3;
        return !Number.isFinite(reach) || reach > max;
    },
    canShootEnemy: (ctx) => !!ctx.combatState?.canShoot,
    rangedEnemyTooClose: (ctx) => !!ctx.combatState?.tooClose,
};
function blockedByGuards(ctx, guards, modeDef) {
    if (!guards) return false;
    for (let i = 0; i < guards.length; i++) if (GUARDS[guards[i]]?.(ctx, modeDef)) return true;
    return false;
}
export function compileDecisionSchemaModes(schema) {
    if (!schema || !schema.scoreOrder) return [];
    const compiled = [];
    for (let i = 0; i < schema.scoreOrder.length; i++) {
        const mode = schema.scoreOrder[i];
        const modeDef = schema.modes[mode];
        if (!modeDef) continue;
        const scorer = SCORERS[modeDef.scorer];
        if (!scorer) throw new Error(`unknown decision scorer: ${modeDef.scorer}`);
        const guards = modeDef.guards
            ? modeDef.guards.map((g) => {
                  const fn = GUARDS[g];
                  if (!fn) throw new Error(`unknown decision guard: ${g}`);
                  return fn;
              })
            : null;
        const mods = modeDef.mods
            ? modeDef.mods.map((m) => {
                  const fn = MODS[m];
                  if (!fn) throw new Error(`unknown decision modifier: ${m}`);
                  return fn;
              })
            : null;
        compiled.push({ mode, modeDef, scorer, guards, mods });
    }
    return compiled;
}
function regroupSizeFactor(segmentCount, cohesion) {
    const count = segmentCount ?? cohesion.referenceSegmentCount ?? 3;
    const ref = cohesion.referenceSegmentCount ?? 3;
    const max = cohesion.maxSegmentScale ?? 12;
    if (count <= ref) return 1;
    if (count >= max) return 0;
    return 1 - (count - ref) / (max - ref);
}
function preyValueForHunger(weights, pressure, hungerTier, effortFallback) {
    const effort = pressure.effort ?? effortFallback?.effort;
    return lookupBandTable(effort?.preyValue, hungerTier, "hungry") ?? weights.prey;
}
const SCORERS = {
    riskAdjustedFlee(ctx, _modeDef, weights, pressure) {
        return netScoreOnly(scoreRiskAdjustedFlee(ctx, weights, pressure));
    },
    preyWithEffort(ctx, modeDef, weights, pressure, env) {
        const prey = ctx.known[modeDef.slot];
        if (!prey) return SCORE_ABSENT;
        const reach = ctx.reachSteps[modeDef.slot];
        if (reach == null) return SCORE_ABSENT;
        const hungerTier = ctx.hungerTier;
        let value = preyValueForHunger(weights, pressure, hungerTier, env.effortFallback);
        const isPreySnake = prey.type === "snake_head";
        const seekerFaction = ctx.seekerFaction;
        if (isPreySnake && seekerFaction && prey.faction && prey.faction !== seekerFaction) value = pressure.enemySnakePreyValue ?? weights.prey + 1000;
        else if (hungerTier === "desperate" && (!ctx.known.food || ctx.routeStatus?.routeFailed)) value += pressure.preyDesperationBonus ?? 0;
        return netScoreDetail(value, reach, costPerCellForHunger(pressure, hungerTier));
    },
    foodWithHunger(ctx, modeDef, weights, pressure, env) {
        if (!ctx.known[modeDef.slot]) return SCORE_ABSENT;
        const reach = ctx.reachSteps[modeDef.slot];
        if (reach == null) return SCORE_ABSENT;
        let value = foodHungerScoreValue(weights, pressure, ctx.foodFraction);
        const sprint = env.sprint;
        const threat = ctx.threatState;
        if (sprint && threat && !threat.lethal && threat.severity >= sprint.fleeSeverity) value -= pressure.sprintFoodCostPenalty ?? 0;
        return netScoreDetail(value, reach, costPerCellForHunger(pressure, ctx.hungerTier));
    },
    reachTarget(ctx, modeDef, weights, pressure) {
        if (!ctx.known[modeDef.slot]) return SCORE_ABSENT;
        const reach = ctx.reachSteps[modeDef.slot];
        if (reach == null) return SCORE_ABSENT;
        const weightKey = modeDef.weightKey ?? modeDef.slot;
        const value = weights[weightKey] ?? weights.explore;
        return netScoreDetail(value, reach, costPerCellForHunger(pressure, ctx.hungerTier));
    },
    rangedAttack(ctx, modeDef, weights, pressure) {
        // Guard: Abort if we have an active agent instance and it is out of ammo.
        // We default to assuming they have ammo if no agentInstance is provided (for test compatibility).
        const ammo = ctx.agentInstance != null ? ctx.agentInstance.ammo : 10;
        if (ammo <= 0) return SCORE_ABSENT;
        const combat = ctx.combatState;
        // 1. Guard: Ensure the agent has an active weapon and is in an eligible combat state
        if (!combat?.canShoot && combat?.phase !== "reacting" && combat?.phase !== "fire_delay" && combat?.phase !== "reloading") return SCORE_ABSENT;
        if (!ctx.known[modeDef.slot]) return SCORE_ABSENT;
        const reach = combat.reachCells ?? ctx.reachSteps[modeDef.slot];
        if (reach == null) return SCORE_ABSENT;
        // 2. Resolve base weight for shooting
        const weightKey = modeDef.weightKey ?? "shoot_enemy";
        const baseValue = weights[weightKey] ?? weights.enemy ?? weights.explore;
        let value = baseValue;
        // 3. Apply Distance-Based Shoot Bonus:
        // Targets that are closer are easier to hit and present a higher priority.
        const weapon = combat.weapon;
        if (weapon && combat.distWorld != null) {
            const maxRange = weapon.maxRange ?? 112;
            const fleeRange = weapon.fleeRange ?? 48;
            const dist = combat.distWorld;
            const denominator = maxRange - fleeRange;
            // Normalize distance factor between 0 (at max range) and 1 (at flee/ideal range)
            const distFactor = denominator > 0 ? Math.max(0, Math.min(1, (maxRange - dist) / denominator)) : 1;
            const distanceBonus = distFactor * (pressure.distanceAttackBonus ?? 100);
            value += distanceBonus;
        }
        // 4. Apply Speed-Affected Aiming Penalty:
        // We only penalize speed if it exceeds the agent's natural combat strafing speed threshold.
        // This ensures the agent still strafes correctly while shooting.
        const speed = combat.agentSpeed ?? 0;
        const strafeSpeed = combat.combatStrafeMaxSpeed ?? 50;
        if (speed > strafeSpeed && strafeSpeed > 0) {
            const excessSpeed = speed - strafeSpeed;
            const speedFactor = excessSpeed / strafeSpeed;
            const speedPenalty = speedFactor * (pressure.speedAimPenalty ?? 150);
            value -= speedPenalty;
        }
        // 5. Compute net score including pathfinding cell reach costs
        return netScoreDetail(value, reach, costPerCellForHunger(pressure, ctx.hungerTier));
    },
    ammoWithNeed(ctx, modeDef, weights, pressure) {
        if (!ctx.known[modeDef.slot]) return SCORE_ABSENT;
        const reach = ctx.reachSteps[modeDef.slot];
        if (reach == null) return SCORE_ABSENT;
        const ammo = ctx.agentInstance != null ? ctx.agentInstance.ammo : 10;
        const desiredAmmo = pressure.desiredAmmo ?? 10;
        const deficit = Math.max(0, 1 - ammo / desiredAmmo);
        if (deficit === 0) return SCORE_ABSENT;
        const value = (weights.ammo ?? 380) + (pressure.ammoNeedBonus ?? 200) * deficit;
        return netScoreDetail(value, reach, costPerCellForHunger(pressure, ctx.hungerTier));
    },
    regroupAlly(ctx, modeDef, weights, pressure, env) {
        const slot = modeDef.slot;
        const ally = ctx.known[slot];
        if (!ally) return SCORE_ABSENT;
        const cohesion = env.cohesion ?? {};
        const hungerTier = ctx.hungerTier;
        const allyReach = ctx.reachSteps[slot];
        if (allyReach == null) return SCORE_ABSENT;
        if (Number.isFinite(allyReach) && allyReach <= (cohesion.idealStopDist ?? 3)) return SCORE_ABSENT;
        let value = weights.seek_ally ?? weights.explore;
        if (modeDef.cohesion === "snake") {
            const sizeFactor = regroupSizeFactor(ctx.seekerSegmentCount, cohesion);
            if (sizeFactor <= 0) return SCORE_ABSENT;
            value = (weights.seek_ally ?? weights.explore) + (cohesion.satisfiedBonus ?? 50);
            value *= sizeFactor;
            const allyCount = ctx.known.allyCount ?? 1;
            if (allyCount > 1) value += (allyCount - 1) * (cohesion.packBonus ?? 15) * sizeFactor;
        } else {
            if (hungerTier === "satisfied") value += cohesion.satisfiedBonus ?? pressure.allySatisfiedBonus ?? 60;
            const allyCount = ctx.known.allyCount ?? 1;
            if (allyCount > 1) value += (allyCount - 1) * (cohesion.packBonus ?? pressure.allyPackBonus ?? 20);
        }
        return netScoreDetail(value, allyReach, costPerCellForHunger(pressure, hungerTier));
    },
    constant(_ctx, modeDef, weights) {
        const weightKey = modeDef.weightKey ?? "explore";
        return netScoreDetail(weights[weightKey], null, 0);
    },
};
const MODS = {
    outnumberedFlee(detail, ctx, _modeDef, _weights, pressure) {
        if (!Number.isFinite(detail.net)) return detail;
        const threatCount = ctx.known.threatCount ?? 1;
        if (threatCount <= 1) return detail;
        return netScoreOnly(detail.net * (1 + (threatCount - 1) * (pressure.outnumberedFleeBonus ?? 0)));
    },
};
function applyMods(detail, ctx, modeDef, weights, pressure, env) {
    if (detail === SCORE_ABSENT) return SCORE_ABSENT;
    const mods = modeDef.mods;
    if (!mods) return detail;
    let out = detail;
    for (let i = 0; i < mods.length; i++) out = MODS[mods[i]](out, ctx, modeDef, weights, pressure, env);
    return out;
}
function scoreMode(ctx, modeDef, weights, pressure, env) {
    if (blockedByGuards(ctx, modeDef.guards, modeDef)) return SCORE_ABSENT;
    const scoreFn = SCORERS[modeDef.scorer];
    if (!scoreFn) throw new Error(`unknown decision scorer: ${modeDef.scorer}`);
    return applyMods(scoreFn(ctx, modeDef, weights, pressure, env), ctx, modeDef, weights, pressure, env);
}
function scoreCompiledMode(ctx, compiled, weights, pressure, env) {
    const modeDef = compiled.modeDef;
    if (compiled.guards) for (let i = 0; i < compiled.guards.length; i++) if (compiled.guards[i](ctx, modeDef)) return SCORE_ABSENT;
    let detail = compiled.scorer(ctx, modeDef, weights, pressure, env);
    if (detail === SCORE_ABSENT) return SCORE_ABSENT;
    if (compiled.mods) for (let i = 0; i < compiled.mods.length; i++) detail = compiled.mods[i](detail, ctx, modeDef, weights, pressure, env);
    return detail;
}
export function scoreDecisionCompiledDetailsInto(out, ctx, spec, weights, pressure, env = {}) {
    resetScoreDetailScratch();
    const compiled = spec.compiledModes;
    if (compiled)
        for (let i = 0; i < compiled.length; i++) {
            const entry = compiled[i];
            out[entry.mode] = scoreCompiledMode(ctx, entry, weights, pressure, env);
        }
    else {
        const schema = spec.decisionSchema;
        for (let i = 0; i < schema.scoreOrder.length; i++) {
            const mode = schema.scoreOrder[i];
            out[mode] = scoreMode(ctx, schema.modes[mode], weights, pressure, env);
        }
    }
    return out;
}
export function scoreDecisionCandidateDetails(ctx, schema, weights, pressure, env = {}) {
    resetScoreDetailScratch();
    const details = {};
    for (let i = 0; i < schema.scoreOrder.length; i++) {
        const mode = schema.scoreOrder[i];
        details[mode] = scoreMode(ctx, schema.modes[mode], weights, pressure, env);
    }
    return details;
}
// === From buildAgentDecisionContext.js ===
const EMPTY_AGENT_REACH_STEPS = Object.freeze({ threat: null, prey: null, enemy: null, food: null, ally: null });
function deriveThreatStateInto(out, visibleThreat, reachSteps, cellSize, shared) {
    if (!visibleThreat || reachSteps == null) return null;
    const visionSpec = shared.visionRange ?? {};
    const fleeRange = shared.fleeRange ?? visionSpec.range;
    const fleeRangeCells = Math.ceil(fleeRange / cellSize);
    const lethalThreatRangeCells = Math.ceil(shared.lethalThreatRange / cellSize);
    out.dist = reachSteps;
    out.severity = Math.max(0, Math.min(1, (fleeRangeCells - reachSteps) / fleeRangeCells));
    out.lethal = reachSteps <= lethalThreatRangeCells;
    return out;
}
export function deriveThreatState(visibleThreat, reachSteps, cellSize, shared) {
    return deriveThreatStateInto({ dist: 0, severity: 0, lethal: false }, visibleThreat, reachSteps, cellSize, shared);
}
function pushSchemaEventTargets(events, visible, remembered, visibleWorld, eventTargets) {
    for (let i = 0; i < eventTargets.length; i++) {
        const slot = eventTargets[i];
        if (typeof slot === "string") {
            pushTargetEvents(events, slot, visible[slot] ?? visibleWorld[slot] ?? null, remembered[slot] ?? null);
            continue;
        }
        const { kind, visible: pickVisible, remembered: pickRemembered } = slot;
        pushTargetEvents(
            events,
            kind,
            pickVisible ? pickVisible(visible, remembered, visibleWorld) : visibleWorld[kind],
            pickRemembered ? pickRemembered(visible, remembered, visibleWorld) : remembered[kind],
        );
    }
}
function writeScoringEnvInto(env, spec) {
    env.cohesion = spec.scoringCohesion;
    if (spec.scoringEffortFallback != null) env.effortFallback = spec.scoringEffortFallback;
    else delete env.effortFallback;
    if (spec.scoringSprint != null) env.sprint = spec.scoringSprint;
    else delete env.sprint;
    return env;
}
function applyRangedBackOffThreat(ctx, input) {
    const combat = ctx.combatState;
    if (!combat?.shouldBackOffEnemy) return;
    const threat = combat.visibleEnemy;
    ctx.visible.threat = threat;
    ctx.known.threat = threat;
    ctx.known.threatCount = Math.max(1, ctx.known.threatCount ?? 0);
    const reachSteps = Number.isFinite(combat.reachCells) ? combat.reachCells : Math.ceil(combat.distWorld / (input.cellSize ?? 16));
    ctx.threatState = deriveThreatStateInto(ctx.threatScratch, threat, reachSteps, input.cellSize ?? 16, input.shared);
}
export class AgentDecisionContext {
    constructor(profileId, schema = getAgentProfile(profileId).decision) {
        this.profileId = profileId;
        this.schema = schema;
        this.visible = {};
        this.remembered = {};
        this.known = {};
        this.candidateScores = {};
        this.candidateScoreDetails = {};
        for (const slotKey of Object.keys(schema.slots)) {
            this.visible[slotKey] = null;
            this.known[slotKey] = null;
        }
        for (const [fieldKey, fieldDef] of Object.entries(schema.fields ?? {})) {
            if (fieldDef.visible != null) this.visible[fieldKey] = fieldDef.visible.default ?? null;
            if (fieldDef.known != null) this.known[fieldKey] = fieldDef.known.default ?? null;
        }
        for (const slot of schema.remembered) this.remembered[slot.key] = slot.constant ?? null;
        for (const mode of schema.scoreOrder) {
            this.candidateScores[mode] = -Infinity;
            this.candidateScoreDetails[mode] = { value: 0, reach: null, cost: 0, net: 0 };
        }
        this.events = [];
        this.threatState = null;
        this.threatScratch = { dist: 0, severity: 0, lethal: false };
        this.allyState = { ally: null, dist: null, count: 0, centroid: null, visible: false, remembered: false, engagement: null, leadworthy: false };
        this.scoringEnv = { cohesion: {} };
        this.reachSteps = EMPTY_AGENT_REACH_STEPS;
        this.committedTarget = null;
        this.routeStatus = null;
        this.foodFraction = null;
        this.hungerTier = null;
        this.chosenIntent = { mode: null, targetId: null, reason: null };
        this.chosenReason = null;
        this.targetId = null;
        this.sprintIntent = { want: false, reason: "none" };
        this.policyLatch = { flee: new PolicyLatchState(), shoot: new PolicyLatchState() };
        this.engagementState = null;
        this.safetyState = null;
        this.recentFailures = [];
        this.seekerFaction = null;
        this.seekerSegmentCount = null;
        this.combatState = {
            enemy: null,
            enemyId: null,
            visibleEnemy: null,
            visibleEnemyId: null,
            distWorld: null,
            reachCells: null,
            agentSpeed: 0,
            combatStrafeMaxSpeed: 50,
            hasLineOfSight: false,
            inWeaponRange: false,
            tooClose: false,
            shouldBackOffEnemy: false,
            phase: "idle",
            onCooldown: false,
            busy: false,
            canShoot: false,
            weapon: null,
        };
        this.agentInstance = null;
    }
    buildFrame(spec, input) {
        const schema = spec.decisionSchema;
        mergeSlotsFromSchemaInto(this, schema, input);
        this.reachSteps = input.reachSteps ?? EMPTY_AGENT_REACH_STEPS;
        this.committedTarget = input.committedTarget ?? null;
        this.routeStatus = input.routeStatus ?? null;
        this.foodFraction = input.foodFraction ?? null;
        this.hungerTier = input.hungerTier ?? null;
        this.threatState = deriveThreatStateInto(this.threatScratch, input.visibleWorld?.threat, input.reachSteps?.threat, input.cellSize ?? 16, input.shared);
        routeEventsInto(this.events, input.routeStatus);
        pushSchemaEventTargets(this.events, this.visible, this.remembered, input.visibleWorld, schema.eventTargets);
        for (const [mode, slotKey] of Object.entries(schema.targetLost)) if (!this.known[slotKey] && input.committedTarget?.mode === mode) this.events.push("TARGET_LOST");
        deriveAllyStateInto(this.allyState, input.visibleWorld, this.known, input.memoryWorld?.memorySource ?? null, spec.allySession?.(input) ?? null, this.reachSteps[spec.allyReachKey ?? "ally"]);
        const extra = spec.extraFacts?.(input);
        if (extra) {
            this.safetyState = extra.safetyState ?? null;
            this.recentFailures = extra.recentFailures ?? [];
            this.seekerFaction = extra.seekerFaction ?? null;
            this.seekerSegmentCount = extra.seekerSegmentCount ?? null;
            this.engagementState = extra.engagementState ?? null;
        }
        this.agentInstance = input.instance ?? null;
        if (spec.deriveCombatState) {
            this.combatState = spec.deriveCombatState(this.combatState, this, input);
            applyRangedBackOffThreat(this, input);
        } else this.combatState = null;
        return this;
    }
    buildContext(spec, input, { includeScoreDetails = false } = {}) {
        const schema = spec.decisionSchema;
        const foodFraction = input.foodFraction ?? null;
        const hungerTier = bandFromThresholds(foodFraction, spec.hungerBands);
        this.buildFrame(spec, { ...input, foodFraction, hungerTier });
        const weights = spec.weights;
        const pressure = spec.pressure;
        writeScoringEnvInto(this.scoringEnv, spec);
        scoreDecisionCompiledDetailsInto(this.candidateScoreDetails, this, spec, weights, pressure, this.scoringEnv);
        const pickPolicy = input.pickPolicy;
        if (includeScoreDetails) {
            scoreCandidateSetInto(this, this.candidateScoreDetails, schema.scoreOrder);
            if (pickPolicy) this.chosenIntent = pickPolicy(this, this.candidateScores);
            else pickAgentIntentPolicyInto(this.chosenIntent, this, this.candidateScores, spec);
        } else {
            scoreCandidateNetsInto(this.candidateScores, this.candidateScoreDetails, schema.scoreOrder);
            if (pickPolicy) this.chosenIntent = pickPolicy(this, this.candidateScores);
            else pickAgentIntentPolicyInto(this.chosenIntent, this, this.candidateScores, spec);
        }
        spec.afterPick?.(this, this.chosenIntent, input);
        deriveSprintIntentInto(this.sprintIntent, this.chosenIntent.mode, this, spec.sprintConfig);
        this.chosenReason = this.chosenIntent.reason ?? null;
        this.targetId = this.chosenIntent.targetId ?? null;
        return this;
    }
}
export function pickAgentIntentPolicyInto(out, ctx, scores, spec) {
    const schema = spec.decisionSchema;
    const mode = pickBestScoreKey(scores, schema.scoreOrder).chosenKey;
    if (mode === "flee") return intentPolicyInto(out, "flee", null, policyReasonForTarget(ctx, "threat"));
    if (mode === "explore") return intentPolicyInto(out, "explore", null, null);
    const slotKey = schema.targetLost[mode];
    if (!slotKey || !ctx.known[slotKey]) return intentPolicyInto(out, mode, null, ctx.chosenReason ?? null);
    return intentPolicyInto(out, mode, ctx.known[slotKey].id, policyReasonForTarget(ctx, slotKey));
}
export function pickAgentIntentPolicy(ctx, scores, spec) {
    const out = { mode: null, targetId: null, reason: null };
    return pickAgentIntentPolicyInto(out, ctx, scores, spec);
}
export function createAgentDecisionContextFrame(profileId, schema) {
    return new AgentDecisionContext(profileId, schema);
}
export function buildAgentDecisionFrameInto(ctx, spec, input) {
    return ctx.buildFrame(spec, input);
}
export function buildAgentDecisionContextInto(ctx, spec, input, options) {
    return ctx.buildContext(spec, input, options);
}
export function buildAgentDecisionFrame(spec, input) {
    const ctx = new AgentDecisionContext(spec.profileId);
    return ctx.buildFrame(spec, input);
}
export function buildAgentDecisionContext(spec, input) {
    const ctx = new AgentDecisionContext(spec.profileId);
    return ctx.buildContext(spec, input, { includeScoreDetails: true });
}
// === From gameDecisionContext.js ===
export { AGENT_PROFILE as AGENT_DECISION_PROFILE };
// Removed re-export of createAgentDecisionContextFrame
export function deriveSnakeEngagementState(ctx, chosenIntent) {
    const { known, remembered } = ctx;
    const salience = [];
    if (known.threat || remembered.threat) salience.push("threat");
    if (known.prey || remembered.prey) salience.push("prey");
    if (known.food || remembered.food) salience.push("food");
    const mode = chosenIntent?.mode ?? null;
    if (mode === "explore" || mode === "seek_ally" || salience.length === 0) return { active: false, salience, mode };
    const acting = (mode === "seek_food" && (known.food || remembered.food)) || (mode === "seek_prey" && (known.prey || remembered.prey)) || (mode === "flee" && (known.threat || remembered.threat));
    return { active: !!acting, salience, mode };
}
const DECISION_EXTENSIONS = {
    [AGENT_PROFILE.snake]: {
        allySession: (input) => input.session ?? null,
        extraFacts: (input) => ({
            safetyState: input.safetyState,
            recentFailures: input.recentFailures ?? [],
            seekerFaction: input.seekerFaction,
            seekerSegmentCount: input.seekerSegmentCount,
            engagementState: null,
        }),
        afterPick: (ctx, chosenIntent) => {
            ctx.engagementState = deriveSnakeEngagementState(ctx, chosenIntent);
        },
    },
};
export function buildAgentDecisionSpec(profileId, profile = getAgentProfile(profileId)) {
    const decision = profile.decision;
    if (decision) {
        if (!decision.compiledSlots) decision.compiledSlots = Object.keys(decision.slots);
        if (!decision.compiledSlotsEntries) decision.compiledSlotsEntries = Object.entries(decision.slots);
        if (decision.fields && !decision.compiledFieldsEntries) decision.compiledFieldsEntries = Object.entries(decision.fields);
    }
    const spec = {
        profileId,
        decisionSchema: decision,
        hungerBands: profile.hungerBands,
        weights: profile.decisionWeights,
        pressure: profile.decisionPressure,
        sprintConfig: profile.sprint,
        scoringCohesion: profile.factionCohesion ?? {},
        scoringEffortFallback: profile.scoringEnv?.effortFallback ? profile.decisionPressure : null,
        scoringSprint: profile.scoringEnv?.sprint ? profile.sprint : null,
        ...(DECISION_EXTENSIONS[profileId] ?? {}),
    };
    if (profile.weapon || profile.decision?.modes?.shoot_enemy) spec.deriveCombatState = (out, ctx, input) => deriveRangedCombatStateInto(out, ctx, input, profile);
    spec.compiledModes = compileDecisionSchemaModes(profile.decision);
    return spec;
}
export function buildAgentDecisionFrameFor(profileId, input) {
    const spec = buildAgentDecisionSpec(profileId);
    const ctx = createAgentDecisionContextFrame(profileId);
    const foodFraction = input.foodFraction ?? null;
    const hungerTier = bandFromThresholds(foodFraction, spec.hungerBands);
    buildAgentDecisionFrameInto(ctx, spec, { ...input, foodFraction, hungerTier, profileId });
    return ctx;
}
export function buildAgentDecisionContextFor(profileId, input) {
    const spec = buildAgentDecisionSpec(profileId);
    const ctx = createAgentDecisionContextFrame(profileId);
    return buildAgentDecisionContextInto(ctx, spec, { ...input, profileId }, { includeScoreDetails: true });
}
export function buildAgentDecisionContextIntoFor(profileId, ctx, input, options) {
    return buildAgentDecisionContextInto(ctx, buildAgentDecisionSpec(profileId), { ...input, profileId }, options);
}
export function scoreAgentIntentCandidateDetails(profileId, ctx, weights = null, pressure = null) {
    const spec = buildAgentDecisionSpec(profileId);
    const env = { cohesion: spec.scoringCohesion };
    if (spec.scoringEffortFallback != null) env.effortFallback = spec.scoringEffortFallback;
    if (spec.scoringSprint != null) env.sprint = spec.scoringSprint;
    return scoreDecisionCandidateDetails(ctx, spec.decisionSchema, weights ?? spec.weights, pressure ?? spec.pressure, env);
}
export function scoreAgentIntentCandidates(profileId, ctx, weights = null, pressure = null) {
    const spec = buildAgentDecisionSpec(profileId);
    return scoreCandidateSet(scoreAgentIntentCandidateDetails(profileId, ctx, weights, pressure), spec.decisionSchema.scoreOrder).candidateScores;
}
export function pickAgentIntentPolicyFor(profileId, ctx, scores = null) {
    const spec = buildAgentDecisionSpec(profileId);
    const resolvedScores = scores ?? scoreAgentIntentCandidates(profileId, ctx);
    return pickAgentIntentPolicy(ctx, resolvedScores, spec);
}
