import { lookupBandTable } from "./bandFromThresholds.js";
import { costPerCellForHunger, foodHungerScoreValue, netScoreDetail, netScoreOnly, resetScoreDetailScratch, SCORE_ABSENT, scoreRiskAdjustedFlee } from "../utility/utilityScoring.js";
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
        const hungerTier = ctx.hungerTier;
        let value = preyValueForHunger(weights, pressure, hungerTier, env.effortFallback);
        const isPreySnake = prey.type === "snake_head";
        const seekerFaction = ctx.seekerFaction;
        if (isPreySnake && seekerFaction && prey.faction && prey.faction !== seekerFaction) value = pressure.enemySnakePreyValue ?? weights.prey + 1000;
        else if (hungerTier === "desperate" && (!ctx.known.food || ctx.routeStatus?.routeFailed)) value += pressure.preyDesperationBonus ?? 0;
        return netScoreDetail(value, ctx.reachSteps[modeDef.slot], costPerCellForHunger(pressure, hungerTier));
    },
    foodWithHunger(ctx, modeDef, weights, pressure, env) {
        if (!ctx.known[modeDef.slot]) return SCORE_ABSENT;
        let value = foodHungerScoreValue(weights, pressure, ctx.foodFraction);
        const sprint = env.sprint;
        const threat = ctx.threatState;
        if (sprint && threat && !threat.lethal && threat.severity >= sprint.fleeSeverity) value -= pressure.sprintFoodCostPenalty ?? 0;
        return netScoreDetail(value, ctx.reachSteps[modeDef.slot], costPerCellForHunger(pressure, ctx.hungerTier));
    },
    reachTarget(ctx, modeDef, weights, pressure) {
        if (!ctx.known[modeDef.slot]) return SCORE_ABSENT;
        const weightKey = modeDef.weightKey ?? modeDef.slot;
        const value = weights[weightKey] ?? weights.explore;
        return netScoreDetail(value, ctx.reachSteps[modeDef.slot], costPerCellForHunger(pressure, ctx.hungerTier));
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
        return netScoreDetail(value, combat.reachCells ?? ctx.reachSteps[modeDef.slot], costPerCellForHunger(pressure, ctx.hungerTier));
    },
    ammoWithNeed(ctx, modeDef, weights, pressure) {
        if (!ctx.known[modeDef.slot]) return SCORE_ABSENT;
        const ammo = ctx.agentInstance != null ? ctx.agentInstance.ammo : 10;
        const desiredAmmo = pressure.desiredAmmo ?? 10;
        const deficit = Math.max(0, 1 - ammo / desiredAmmo);
        if (deficit === 0) return SCORE_ABSENT;
        const value = (weights.ammo ?? 380) + (pressure.ammoNeedBonus ?? 200) * deficit;
        return netScoreDetail(value, ctx.reachSteps[modeDef.slot], costPerCellForHunger(pressure, ctx.hungerTier));
    },
    regroupAlly(ctx, modeDef, weights, pressure, env) {
        const slot = modeDef.slot;
        const ally = ctx.known[slot];
        if (!ally) return SCORE_ABSENT;
        const cohesion = env.cohesion ?? {};
        const hungerTier = ctx.hungerTier;
        const allyReach = ctx.reachSteps[slot];
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
export function scoreDecisionCandidateDetails(ctx, schema, weights, pressure, env = {}) {
    resetScoreDetailScratch();
    const details = {};
    for (const mode of schema.scoreOrder) details[mode] = scoreMode(ctx, schema.modes[mode], weights, pressure, env);
    return details;
}
