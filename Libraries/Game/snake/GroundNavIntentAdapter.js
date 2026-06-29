import { spawnGunBulletProjectile } from "./gunAgent/gunBulletSystem.js";
import { angleDelta, rotateAngleTowards } from "../../Math/Angle.js";
import { AgentIntentFSM, createExploreIntentState, createFleeIntentState, createSeekIntentState } from "../../AI/agentIntent/AgentIntent.js";
import { deriveSprintIntent, buildAgentDecisionContextInto, buildAgentDecisionSpec, createAgentDecisionContextFrame } from "../../AI/agents/AgentDecisionContext.js";
import { publishAgentEngagement } from "../../AI/agents/AgentProfiles.js";
import { pickFleeCell } from "../../AI/steering/pickFleeCell.js";
import { pickCombatStrafeCell } from "../../AI/steering/pickCombatStrafeCell.js";
import { buildFlowTargetStepsInto, createFlowTargetStepSlots } from "../../Navigation/flowTargetSteps.js";
import { createFlowReachStaleCache } from "../../Navigation/flowReachStaleCache.js";
import { pickExploreDestination } from "../../Navigation/steering/exploreSteering.js";
import { createCellTargetLocomotion } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { perceiveAgentWorldInto, resolveVisibleCategoryInVision } from "../../AI/perception/agentWorldPerception.js";
import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { pickWalkableCell } from "../../Procedural/Mazes/walkableCells.js";
import { colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { getPropCategoryIndex } from "../../../GameState/SandboxWorldState.js";
import { AGENT_PROFILE } from "../../AI/agents/AgentProfiles.js";
import { getAgentIdentity } from "../../AI/identity/agentIdentity.js";
import { resolveRelationshipForInstances } from "./AgentInstance.js";
import { isSnakeShardFood, isEdibleSnakeFoodForSeeker } from "./snakeFood.js";
import { requireSnakeVisionFrame } from "./snakePerception.js";
import { isAgentEngaged } from "../../AI/agents/AgentProfiles.js";
import { syncBallAgentFacingToTarget, DEFAULT_BALL_FACING_TURN_RAD_PER_SEC } from "./AgentInstance.js";
import { getObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
const DEFAULT_FIRE_AIM_TOLERANCE_RAD = 0.08;
const DEFAULT_WEAPON_MAX_RANGE = 128;
const INTENT_MEMORY_KINDS = ["threat", "prey", "food", "ally"];
// ==========================================
// Target Memory Database
// ==========================================
function refreshRecord(record, target, grid) {
    record.x = target.x;
    record.y = target.y;
    record.cellIdx = grid.worldCol(target.x) + grid.worldRow(target.y) * grid.cols;
    record.ageTicks = 0;
    record.confidence = 1;
}
function ageRecord(record) {
    if (!record) return null;
    record.ageTicks++;
    record.confidence = Math.max(0, 1 - record.ageTicks / Math.max(record.ttlTicks, 1));
    return record.ageTicks <= record.ttlTicks ? record : null;
}
function snapshotRecord(record) {
    if (!record) return null;
    return { kind: record.kind, id: record.id, cellIdx: record.cellIdx, ageTicks: record.ageTicks, ttlTicks: record.ttlTicks, confidence: record.confidence };
}
export function targetFromMemoryRecord(record, state = null) {
    if (!record) return null;
    if (state?.entityRegistry && record.id != null) {
        const live = state.entityRegistry.getLive(record.id);
        if (!live || live.isDead) return null;
    }
    return { id: record.id, x: record.x, y: record.y, memoryRecord: record };
}
export class TargetMemory {
    constructor(kinds, ttlByKind) {
        this.kinds = kinds;
        this.ttlByKind = ttlByKind;
        this.records = {};
        for (const kind of kinds) this.records[kind] = null;
    }
    observe(kind, target, observer, grid) {
        if (target) {
            const id = target.id ?? null;
            const existing = this.records[kind];
            if (existing && existing.id === id) refreshRecord(existing, target, grid);
            else {
                const cellIdx = grid.worldCol(target.x) + grid.worldRow(target.y) * grid.cols;
                this.records[kind] = { kind, id, x: target.x, y: target.y, cellIdx, ageTicks: 0, ttlTicks: this.ttlByKind[kind], confidence: 1 };
            }
        } else this.records[kind] = ageRecord(this.records[kind]);
    }
    record(kind) {
        return this.records[kind];
    }
    snapshot() {
        const out = {};
        for (const kind of this.kinds) out[kind] = snapshotRecord(this.records[kind]);
        return out;
    }
    clear() {
        for (const kind of this.kinds) this.records[kind] = null;
    }
    clearTarget(id) {
        for (const kind of this.kinds) if (this.records[kind]?.id === id) this.records[kind] = null;
    }
}
// ==========================================
// Agent Intent Memory
// ==========================================
function allyIfEngaged(session, ally) {
    if (!ally) return null;
    if (session && !isAgentEngaged(session, ally.id)) return null;
    return ally;
}
function mergeTarget(visibleWorld, kind, record, state) {
    return visibleWorld[kind] ?? targetFromMemoryRecord(record, state);
}
function mergeAlly(visibleWorld, record, state, session, filterAllyForEngagement) {
    if (!filterAllyForEngagement) return mergeTarget(visibleWorld, "ally", record, state);
    let ally = allyIfEngaged(session, visibleWorld.ally) ?? targetFromMemoryRecord(record, state);
    return allyIfEngaged(session, ally);
}
export class AgentIntentMemory {
    constructor({ threatTtlTicks = 45, preyTtlTicks = 90, foodTtlTicks = 180, allyTtlTicks = 60, filterAllyForEngagement = false } = {}) {
        this.filterAllyForEngagement = filterAllyForEngagement;
        this.memory = new TargetMemory(INTENT_MEMORY_KINDS, { threat: threatTtlTicks, prey: preyTtlTicks, food: foodTtlTicks, ally: allyTtlTicks });
        this.memorySource = { threat: false, prey: false, food: false, ally: false };
        this.world = { threat: null, prey: null, food: null, ally: null, allyCount: 0, allyCentroid: null, threatCount: 0, memorySource: this.memorySource };
    }
    update(seeker, state, visibleWorld) {
        const grid = state.obstacleGrid;
        const session = state.sandbox?.snakeGame;
        const ally = this.filterAllyForEngagement ? allyIfEngaged(session, visibleWorld.ally) : visibleWorld.ally;
        this.memory.observe("threat", visibleWorld.threat, seeker, grid);
        this.memory.observe("prey", visibleWorld.prey, seeker, grid);
        this.memory.observe("food", visibleWorld.food, seeker, grid);
        this.memory.observe("ally", ally, seeker, grid);
    }
    enrichWorld(state, visibleWorld) {
        const session = state.sandbox?.snakeGame;
        const threat = mergeTarget(visibleWorld, "threat", this.memory.record("threat"), state);
        const prey = mergeTarget(visibleWorld, "prey", this.memory.record("prey"), state);
        const food = mergeTarget(visibleWorld, "food", this.memory.record("food"), state);
        const ally = mergeAlly(visibleWorld, this.memory.record("ally"), state, session, this.filterAllyForEngagement);
        this.world.threat = threat;
        this.world.prey = prey;
        this.world.food = food;
        this.world.ally = ally;
        this.world.threatCount = visibleWorld.threatCount ?? 0;
        this.world.allyCount = visibleWorld.ally ? (visibleWorld.allyCount ?? 1) : ally ? 1 : 0;
        this.world.allyCentroid = visibleWorld.ally ? (visibleWorld.allyCentroid ?? null) : null;
        this.memorySource.threat = !visibleWorld.threat && !!threat;
        this.memorySource.prey = !visibleWorld.prey && !!prey;
        this.memorySource.food = !visibleWorld.food && !!food;
        this.memorySource.ally = !visibleWorld.ally && !!ally;
        return this.world;
    }
    getWorld() {
        return this.world;
    }
    snapshot() {
        return this.memory.snapshot();
    }
    clear() {
        this.memory.clear();
        this.world.threat = null;
        this.world.prey = null;
        this.world.food = null;
        this.world.ally = null;
        this.world.allyCount = 0;
        this.world.allyCentroid = null;
        this.world.threatCount = 0;
        this.memorySource.threat = false;
        this.memorySource.prey = false;
        this.memorySource.food = false;
        this.memorySource.ally = false;
    }
    clearTarget(id) {
        this.memory.clearTarget(id);
    }
}
// ==========================================
// Policy Latching / Hysteresis
// ==========================================
export class ModePolicyLatch {
    constructor({ mode, minTicks = 0, holdReason = `${mode}_held`, refreshWhen = () => false, canRelease = () => true }) {
        this.mode = mode;
        this.minTicks = minTicks;
        this.holdReason = holdReason;
        this.refreshWhen = refreshWhen;
        this.canRelease = canRelease;
        this.active = false;
        this.ticksRemaining = 0;
    }
    _holdPolicy(policy) {
        return { mode: this.mode, targetId: null, reason: this.holdReason, blockedPolicy: policy };
    }
    apply(policy, context = {}) {
        if (context.currentMode === this.mode && !this.active) {
            this.active = true;
            this.ticksRemaining = this.minTicks;
        }
        if (policy.mode === this.mode) {
            this.active = true;
            this.ticksRemaining = Math.max(this.ticksRemaining, this.minTicks);
            return policy;
        }
        if (!this.active) return policy;
        if (this.refreshWhen(context, policy)) this.ticksRemaining = Math.max(this.ticksRemaining, this.minTicks);
        if (this.ticksRemaining > 0) {
            this.ticksRemaining--;
            return this._holdPolicy(policy);
        }
        if (!this.canRelease(context, policy)) return this._holdPolicy(policy);
        this.active = false;
        return policy;
    }
    clear() {
        this.active = false;
        this.ticksRemaining = 0;
    }
    snapshot() {
        return { mode: this.mode, active: this.active, ticksRemaining: this.ticksRemaining };
    }
}
// ==========================================
// Ranged Combat Logic
// ==========================================
export function resolveRangedWeapon(instance, profile, visionRange = null) {
    const weapon = instance?.equippedWeapon ?? profile?.weapon ?? null;
    if (!weapon) return null;
    const inset = weapon.maxRangeVisionInset;
    const maxRange = weapon.maxRange ?? (Number.isFinite(visionRange) && Number.isFinite(inset) ? Math.max(0, visionRange - inset) : null) ?? profile?.attackRange ?? DEFAULT_WEAPON_MAX_RANGE;
    const fleeRange = weapon.fleeRange ?? profile?.attackRange ?? 48;
    return { ...weapon, maxRange, fleeRange };
}
export function hasRangedCombatCapability(instance, profile, visionRange = null) {
    return !!(resolveRangedWeapon(instance, profile, visionRange) || profile?.decision?.modes?.shoot_enemy);
}
export class RangedCombatActionState {
    constructor() {
        this.phase = "idle";
        this.targetId = null;
        this.timerMs = 0;
        this.aimAngle = 0;
        this.shotsFired = 0;
        this.lostLosMs = 0;
    }
    reset() {
        this.phase = "idle";
        this.targetId = null;
        this.timerMs = 0;
        this.aimAngle = 0;
        this.shotsFired = 0;
        this.lostLosMs = 0;
    }
    isOnCooldown() {
        return this.phase === "fire_delay" || this.phase === "reloading";
    }
    isBusy() {
        return this.phase === "reacting" || this.phase === "fire_delay" || this.phase === "reloading";
    }
}
export function deriveRangedCombatStateInto(out, ctx, input, profile) {
    const weapon = input.agentInstance?.resolvedWeapon ?? resolveRangedWeapon({ equippedWeapon: input.equippedWeapon }, profile, input.weaponVisionRange);
    if (!weapon) {
        if (out) out.weapon = null;
        return null;
    }
    const maxRange = weapon.maxRange;
    const fleeRange = weapon.fleeRange;
    const action = input.actionState ?? null;
    const seeker = input.agent;
    const state = input.state;
    const visibleEnemy = ctx.visible.enemy;
    const knownEnemy = ctx.known.enemy;
    const enemy = visibleEnemy ?? knownEnemy;
    let distWorld = null;
    if (enemy && seeker) {
        const dx = enemy.x - seeker.x;
        const dy = enemy.y - seeker.y;
        distWorld = Math.hypot(dx, dy);
    }
    const reachCells = ctx.reachSteps?.enemy;
    const agentSpeed = seeker ? Math.hypot(seeker.vx ?? 0, seeker.vy ?? 0) : 0;
    const combatStrafeMaxSpeed = input.combatStrafeMaxSpeed ?? 50;
    const los = visibleEnemy ? getObserverVisionFrame(state).isVisible(seeker, visibleEnemy.x, visibleEnemy.y) : false;
    const inWeaponRange = distWorld != null && distWorld <= maxRange;
    const tooClose = distWorld != null && distWorld <= fleeRange;
    const phase = action?.phase ?? "idle";
    const onCooldown = action ? action.isOnCooldown() : false;
    const busy = action ? action.isBusy() : false;
    const hasAmmo = input.agentInstance ? input.agentInstance.ammo > 0 : input.instance ? input.instance.ammo > 0 : true;
    const canShoot = !!visibleEnemy && los && inWeaponRange && phase === "idle" && hasAmmo;
    const hasIdAdvantage = seeker && enemy && seeker.id != null && enemy.id != null ? seeker.id > enemy.id : false;
    const shouldBackOffEnemy = !!visibleEnemy && tooClose && (phase === "reloading" || (phase === "idle" && !hasIdAdvantage));
    if (!out)
        out = {
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
    out.enemy = enemy;
    out.enemyId = enemy?.id ?? null;
    out.visibleEnemy = visibleEnemy;
    out.visibleEnemyId = visibleEnemy?.id ?? null;
    out.distWorld = distWorld;
    out.reachCells = reachCells;
    out.agentSpeed = agentSpeed;
    out.combatStrafeMaxSpeed = combatStrafeMaxSpeed;
    out.hasLineOfSight = los;
    out.inWeaponRange = inWeaponRange;
    out.tooClose = tooClose;
    out.shouldBackOffEnemy = shouldBackOffEnemy;
    out.phase = phase;
    out.onCooldown = onCooldown;
    out.busy = busy;
    out.canShoot = canShoot;
    out.weapon = weapon;
    return out;
}
export function deriveRangedCombatState(ctx, input, profile) {
    return deriveRangedCombatStateInto(null, ctx, input, profile);
}
function fireBullet(state, shooterInstance, angle, weapon) {
    spawnGunBulletProjectile(state, shooterInstance, angle, weapon);
}
function resolveLiveTarget(ctx) {
    if (ctx.target) return ctx.target;
    if (ctx.targetId == null) return null;
    return ctx.state.entityRegistry.getLive(ctx.targetId);
}
function getAimTurnSpeedMultiplier(combat) {
    if (!combat) return 1;
    const speed = combat.agentSpeed ?? 0;
    const strafeSpeed = combat.combatStrafeMaxSpeed ?? 50;
    if (speed <= strafeSpeed) return 1;
    const excess = speed - strafeSpeed;
    const penaltyScale = Math.min(0.5, excess / strafeSpeed);
    return 1 - penaltyScale;
}
function getAimToleranceMultiplier(combat) {
    if (!combat) return 1;
    const speed = combat.agentSpeed ?? 0;
    const strafeSpeed = combat.combatStrafeMaxSpeed ?? 50;
    if (speed <= strafeSpeed) return 1;
    const excess = speed - strafeSpeed;
    const penaltyScale = Math.min(1.5, excess / strafeSpeed);
    return 1 + penaltyScale;
}
function getAimRotationSpeed(ctx, weapon) {
    const baseSpeed = weapon.aimRotationRadPerSec ?? DEFAULT_BALL_FACING_TURN_RAD_PER_SEC;
    const combat = ctx.world?.decisionContext?.combatState;
    return baseSpeed * getAimTurnSpeedMultiplier(combat);
}
function getAimToleranceRad(ctx, weapon) {
    const baseTolerance = weapon.fireAimToleranceRad ?? DEFAULT_FIRE_AIM_TOLERANCE_RAD;
    const combat = ctx.world?.decisionContext?.combatState;
    return baseTolerance * getAimToleranceMultiplier(combat);
}
function targetAngleFromAgent(agent, target) {
    return Math.atan2(target.y - agent.y, target.x - agent.x);
}
function combatStateCanAimAtTarget(ctx, target) {
    const combat = ctx.world.decisionContext.combatState;
    if (combat?.enemyId === target?.id) return combat.hasLineOfSight;
    return getObserverVisionFrame(ctx.state).isVisible(ctx.agent, target.x, target.y);
}
function targetInWeaponWindow(agent, target, weapon) {
    const dist = Math.hypot(target.x - agent.x, target.y - agent.y);
    const maxRange = weapon.maxRange;
    return dist <= maxRange;
}
function aimReadyForShot(ctx, agent, target, action, weapon) {
    const aimAngle = action.aimAngle ?? agent.facing ?? targetAngleFromAgent(agent, target);
    const targetAngle = targetAngleFromAgent(agent, target);
    const tolerance = getAimToleranceRad(ctx, weapon);
    return Math.abs(angleDelta(aimAngle, targetAngle)) <= tolerance;
}
function verifyTargetValid(ctx, action, weapon, target, dtMs) {
    if (!target || target.isDead) {
        action.reset();
        return false;
    }
    const hasLos = combatStateCanAimAtTarget(ctx, target);
    const inRange = targetInWeaponWindow(ctx.agent, target, weapon);
    if (!hasLos || !inRange) {
        action.lostLosMs = (action.lostLosMs ?? 0) + dtMs;
        const reachedToleranceLimit = action.lostLosMs > (weapon.aimLostTolerateMs ?? 200);
        if (reachedToleranceLimit) action.reset();
        return false;
    }
    action.lostLosMs = 0;
    return true;
}
function beginReaction(ctx, action, agent, target, weapon, dtMs) {
    action.phase = "reacting";
    action.targetId = target.id;
    action.timerMs = weapon.reactionMs ?? 1000;
    const targetAngle = targetAngleFromAgent(agent, target);
    const initialAngle = agent.facing !== undefined && !Number.isNaN(agent.facing) ? agent.facing : targetAngle;
    const turnRadPerSec = getAimRotationSpeed(ctx, weapon);
    const maxStep = turnRadPerSec * (dtMs / 1000);
    action.aimAngle = rotateAngleTowards(initialAngle, targetAngle, maxStep);
    agent.facing = action.aimAngle;
}
function tickAimAndFire(ctx, instance, action, weapon, dtMs) {
    const target = resolveLiveTarget(ctx);
    if (!verifyTargetValid(ctx, action, weapon, target, dtMs)) return;
    const agent = ctx.agent;
    action.timerMs = Math.max(0, action.timerMs - dtMs);
    const turnRadPerSec = getAimRotationSpeed(ctx, weapon);
    if (combatStateCanAimAtTarget(ctx, target)) action.aimAngle = syncBallAgentFacingToTarget(agent, target, dtMs, turnRadPerSec);
    if (action.timerMs <= 0 && aimReadyForShot(ctx, agent, target, action, weapon))
        if (!instance || instance.ammo > 0) {
            if (instance && instance.ammo > 0) instance.ammo--;
            const angle = action.aimAngle ?? agent.facing ?? 0;
            fireBullet(ctx.state, instance, angle, weapon);
            action.shotsFired = (action.shotsFired || 0) + 1;
            const magSize = weapon.magazineSize ?? 3;
            if (action.shotsFired < magSize) {
                action.phase = "fire_delay";
                action.timerMs = weapon.fireDelayMs ?? 150;
            } else {
                action.phase = "reloading";
                action.timerMs = weapon.reloadMs ?? 500;
            }
        } else action.reset();
}
function tickReloading(ctx, action, weapon, dtMs) {
    const agent = ctx.agent;
    action.timerMs = Math.max(0, action.timerMs - dtMs);
    const target = resolveLiveTarget(ctx);
    const turnRadPerSec = getAimRotationSpeed(ctx, weapon);
    if (target && !target.isDead && combatStateCanAimAtTarget(ctx, target)) action.aimAngle = syncBallAgentFacingToTarget(agent, target, dtMs, turnRadPerSec);
    if (action.timerMs <= 0) action.reset();
}
function strafeRepickTicks(weapon) {
    return weapon.combatMovement?.repickTicks ?? 45;
}
function shouldRefreshCombatStrafe(ctx, strafeState, weapon) {
    if (!ctx.dest) return true;
    if (ctx.ticks >= strafeState.repickAt) return true;
    if (ctx.locomotion.hasArrivedAtDest(ctx.agent, ctx.grid)) return true;
    if (ctx.locomotion.hasReachedDest(ctx.agent, ctx.grid)) return true;
    return false;
}
function maintainCombatStrafe(fsm, ctx, strafeState, weapon, adapterInstance) {
    const combat = ctx.world.decisionContext.combatState;
    if (!combat?.hasLineOfSight || combat.tooClose || !ctx.target || ctx.target.isDead) {
        strafeState.lastCell = null;
        strafeState.repickAt = 0;
        ctx.locomotion.clearDestination(ctx.agent, ctx.state);
        return;
    }
    if (!shouldRefreshCombatStrafe(ctx, strafeState, weapon)) {
        fsm.holdDestination("shoot_strafe");
        return;
    }
    const cell = adapterInstance.setCombatStrafeDestination({ agent: ctx.agent, state: ctx.state, world: ctx.world, avoidCell: strafeState.lastCell, locomotion: ctx.locomotion });
    if (cell) {
        strafeState.lastCell = cell;
        strafeState.repickAt = ctx.ticks + strafeRepickTicks(weapon);
        fsm.setLastTransition("shoot_strafe");
        return;
    }
    fsm.holdDestination("shoot_strafe_hold");
}
export function createRangedShootIntentState(instance, resolveWeapon, adapterInstance) {
    const strafeState = { lastCell: null, repickAt: 0 };
    return {
        enter(fsm, ctx) {
            const weapon = resolveWeapon(instance);
            if (!weapon) return;
            const action = instance.combatAction;
            const combat = ctx.world.decisionContext.combatState;
            maintainCombatStrafe(fsm, ctx, strafeState, weapon, adapterInstance);
            if (action.phase === "idle" && combat?.canShoot && ctx.target) beginReaction(ctx, action, ctx.agent, ctx.target, weapon, ctx.dtMs ?? 16);
            else if (action.phase === "reacting") tickAimAndFire(ctx, instance, action, weapon, 0);
        },
        update(fsm, ctx) {
            const weapon = resolveWeapon(instance);
            if (!weapon) return;
            const action = instance.combatAction;
            const dtMs = ctx.dtMs ?? 16;
            const combat = ctx.world.decisionContext.combatState;
            switch (action.phase) {
                case "reloading":
                    tickReloading(ctx, action, weapon, dtMs);
                    maintainCombatStrafe(fsm, ctx, strafeState, weapon, adapterInstance);
                    if (ctx.policy.mode !== "shoot_enemy") fsm.transitionTo(ctx.policy.mode, ctx.policy.reason ?? "reloading_done", ctx.policy.targetId);
                    return;
                case "fire_delay":
                case "reacting":
                    tickAimAndFire(ctx, instance, action, weapon, dtMs);
                    maintainCombatStrafe(fsm, ctx, strafeState, weapon, adapterInstance);
                    return;
            }
            if (!ctx.target || ctx.target.isDead) {
                strafeState.lastCell = null;
                strafeState.repickAt = 0;
                fsm.transitionTo(ctx.policy.mode, "target_lost", ctx.policy.targetId);
                return;
            }
            if (combat?.canShoot) beginReaction(ctx, action, ctx.agent, ctx.target, weapon, dtMs);
            maintainCombatStrafe(fsm, ctx, strafeState, weapon, adapterInstance);
        },
    };
}
export function resetInstanceRangedCombatAction(instance) {
    if (instance.combatAction) instance.combatAction.reset();
}
export function createRangedCombatPolicyExtension() {
    const shootLatch = new ModePolicyLatch({
        mode: "shoot_enemy",
        minTicks: 0,
        holdReason: "shoot_held",
        refreshWhen: ({ world }) => {
            const combat = world.decisionContext.combatState;
            if (!combat) return false;
            if (combat.busy) return true;
            return combat.canShoot;
        },
        canRelease: ({ world, policy }) => {
            const combat = world.decisionContext.combatState;
            if (!combat) return true;
            if (combat.busy) return false;
            if (policy.mode === "flee") return true;
            if (combat.canShoot) return false;
            return combat.phase === "idle" || combat.phase == null;
        },
    });
    return {
        clear() {
            shootLatch.clear();
        },
        apply({ world, currentMode, sprintConfig, policyIn, policyOut }) {
            const ctx = world.decisionContext;
            const resolved = shootLatch.apply(policyIn, { world, currentMode, policy: policyIn });
            if (resolved.mode === "shoot_enemy" && resolved.targetId == null) resolved.targetId = policyIn.targetId ?? ctx.known.enemy?.id ?? null;
            policyOut.mode = resolved.mode;
            policyOut.targetId = resolved.targetId ?? null;
            policyOut.reason = resolved.reason ?? null;
            if (resolved !== policyIn) {
                ctx.chosenIntent = resolved;
                ctx.chosenReason = resolved.reason ?? null;
                ctx.targetId = resolved.targetId ?? null;
                ctx.sprintIntent = deriveSprintIntent(resolved.mode, ctx, sprintConfig);
            }
            ctx.policyLatch = { ...(ctx.policyLatch ?? {}), shoot: shootLatch.snapshot() };
            return policyOut;
        },
    };
}
// ==========================================
// Inner FSM Infrastructure Helpers
// ==========================================
function readAgentRouteStatusInto(out, locomotion, agent, state) {
    const dest = locomotion.getDestination();
    const status = locomotion.getStatus(agent, state);
    out.hasDestination = !!dest;
    out.hasRoute = status.hasRoute;
    out.replanPending = status.replanPending;
    out.routeFailed = !!dest && locomotion.needsRetry(agent, state);
    out.destReached = !!dest && (locomotion.hasArrivedAtDest(agent, state.obstacleGrid) || locomotion.hasReachedDest(agent, state.obstacleGrid));
    out.stuckFrames = status.stuckFrames;
    out.pathLen = status.pathLen;
    return out;
}
function createBrainArrivalStamper(brain) {
    let lastArrivalIdx = null;
    return {
        stamp(agent, grid) {
            const col = grid.worldCol(agent.x);
            const row = grid.worldRow(agent.y);
            const idx = col + row * grid.cols;
            if (idx === lastArrivalIdx) return;
            lastArrivalIdx = idx;
            brain.stampArrival(idx);
        },
        reset() {
            lastArrivalIdx = null;
        },
    };
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
function augmentCellTargetIntentContext(ctx, { locomotion, resolveCommittedTarget }) {
    ctx.grid = ctx.state.obstacleGrid;
    ctx.dest = locomotion.getDestination() || null;
    ctx.target = resolveCommittedTarget(ctx.targetId, ctx.world);
    ctx.fleeTarget = ctx.world.decisionContext.known.threat;
    ctx.locomotion = locomotion;
    return ctx;
}
const ACCEPT_PREDICATES = { edibleFood: isEdibleSnakeFoodForSeeker, ammoShard: (seeker, prop) => prop.type === "ammo_shard" && !prop.isDead };
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
function hasRangedShootMode(profile) {
    return !!profile.decision?.modes?.shoot_enemy;
}
export function resolveSnakeExploreCell(seeker, state, memory, rng, navWalkable, shared) {
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
const PACK_STEERING_SCRATCH = { packAnchor: { x: 0, y: 0 }, packBlend: 0, maxPackDistCells: 16 };
export function resolvePackSteeringOptions(ctx, instance) {
    const cohesion = instance.profile.factionCohesion ?? {};
    const packBlend = cohesion.fleePackBlend ?? 0;
    if (packBlend <= 0) return null;
    const known = ctx.known;
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
// ==========================================
// Class GroundNavIntentAdapter
// ==========================================
export class GroundNavIntentAdapter extends AgentIntentFSM {
    constructor({ state, instance, brain, sync, headNav, agentCtx }) {
        const profile = instance.profile;
        const profileId = instance.profileId;
        const intent = profile.intent;
        const shared = agentCtx.session.config.shared;
        const navWalkable = agentCtx.navWalkable;
        const visibleSourceResolvers = buildVisibleSourceResolvers(profile);
        const decisionSpec = buildAgentDecisionSpec(profileId, profile);
        const decisionContext = createAgentDecisionContextFrame(profileId, decisionSpec.decisionSchema);
        const hasRangedShoot = hasRangedShootMode(profile);
        const policyExtensions = hasRangedShoot ? [createRangedCombatPolicyExtension()] : [];
        const onIntentClear = hasRangedShoot ? () => resetInstanceRangedCombatAction(instance) : null;
        const intentMemoryOptions = intent.filterAllyForEngagement ? { ...shared.intentMemory, filterAllyForEngagement: true } : shared.intentMemory;
        const resolvedVision = instance.visionRange ?? shared.visionRange;
        const locomotion = createCellTargetLocomotion(headNav);
        const intentMemory = new AgentIntentMemory(intentMemoryOptions);
        const fleeLatch = new ModePolicyLatch({
            mode: "flee",
            minTicks: shared.fleeHysteresis.minTicks,
            holdReason: "flee_hysteresis",
            refreshWhen: ({ world }) => {
                const threat = world.decisionContext.threatState;
                return threat?.lethal || threat?.severity >= shared.fleeHysteresis.refreshAtSeverity;
            },
            canRelease: ({ world }) => {
                const threat = world.decisionContext.threatState;
                return !threat || (!threat.lethal && threat.severity <= shared.fleeHysteresis.exitThreatSeverity);
            },
        });
        const arrivalStamper = createBrainArrivalStamper(brain);
        const staleCache = createFlowReachStaleCache();
        const reachSlotList = createFlowTargetStepSlots(intent.reachSlots);
        const visible = { threat: null, prey: null, food: null, ally: null, allyCount: 0, allyCentroid: null, threatCount: 0 };
        const routeStatus = { hasDestination: false, hasRoute: false, replanPending: false, routeFailed: false, destReached: false, stuckFrames: 0, pathLen: null };
        const committed = { mode: null, targetId: null };
        const reachSteps = {};
        for (let i = 0; i < reachSlotList.length; i++) reachSteps[reachSlotList[i].key] = null;
        const flowReachContext = { state: null, agent: null, staleCache, range: shared.decisionReachHorizon ?? 32, flowResult: { slot: null, steps: null, ready: false } };
        const perceiveWorld = { decisionContext };
        const policyScratch = { mode: null, targetId: null, reason: null };
        const perceptionOptions = {
            readVisionFrame: requireSnakeVisionFrame,
            agentRange: shared.fleeRange ?? resolvedVision.range,
            resolveRelationship: resolveRelationshipForInstances,
            committedTargetId: null,
            targetStickyFactor: shared.targetingHysteresis.targetStickyFactor ?? 0.75,
        };
        const intentContext = {
            agent: null,
            state: null,
            world: null,
            policy: policyScratch,
            mode: null,
            targetId: null,
            ticks: 0,
            lastModeChangeTick: 0,
            grid: null,
            dest: null,
            target: null,
            fleeTarget: null,
            locomotion: null,
            dtMs: 16,
        };
        const states = {
            explore: createExploreIntentState({ locomotion, resolveExploreCell: (seeker, gameState, memory, exploreRng) => this.resolveExploreCell(seeker, gameState, memory, exploreRng), brain }),
            seek_food: createSeekIntentState({ locomotion, seekArrivalRadius: (mode, agent, target) => this.seekArrivalRadius(mode, agent, target) }),
            seek_ally: createSeekIntentState({ locomotion, seekArrivalRadius: (mode, agent, target) => this.seekArrivalRadius(mode, agent, target) }),
            flee: createFleeIntentState({ locomotion, setFleeDestination: (args) => this.setFleeDestination(args) }),
        };
        states[intent.huntMode] = states.seek_food;
        super({
            initialMode: "explore",
            sync: (agent, state) => {
                sync(agent, state);
                arrivalStamper.stamp(agent, state.obstacleGrid);
            },
            perceiveWorld: (agent, state) => {
                perceptionOptions.committedTargetId = this.getTargetId();
                perceiveAgentWorldInto(visible, agent, agentCtx, state, visibleSourceResolvers, resolvedVision, perceptionOptions);
                intentMemory.update(agent, state, visible);
                const memoryWorld = intentMemory.enrichWorld(state, visible);
                committed.mode = this.getMode();
                committed.targetId = this.getTargetId();
                readAgentRouteStatusInto(routeStatus, locomotion, agent, state);
                flowReachContext.state = state;
                flowReachContext.agent = agent;
                buildFlowTargetStepsInto(reachSteps, memoryWorld, committed, routeStatus, reachSlotList, flowReachContext);
                this.buildDecisionContext({ agent, state, visible, memoryWorld, committed, routeStatus, reachSteps });
                if (intent.publishEngagement) publishAgentEngagement(state.sandbox.snakeGame, instance.headId, decisionContext.engagementState);
                this._lastDecisionContext = decisionContext;
                return perceiveWorld;
            },
            pickPolicy: (world) => {
                this.applyFleePolicyLatch(fleeLatch, world, policyScratch);
                for (let i = 0; i < policyExtensions.length; i++)
                    policyExtensions[i].apply({ world, currentMode: this.getMode(), sprintConfig: profile.sprint, policyIn: policyScratch, policyOut: policyScratch });
                return policyScratch;
            },
            transitionReason: transitionReason(intent.seekModes),
            states,
            modeExitDelayTicks: hasRangedShoot ? { flee: 30, shoot_enemy: 15 } : { flee: 30 },
            contextFrame: intentContext,
            augmentContext: (ctx) => augmentCellTargetIntentContext(ctx, { locomotion, resolveCommittedTarget: (id, world) => this.resolveCommittedTarget(id, world) }),
            onClear: (agent, state) => {
                arrivalStamper.reset();
                fleeLatch.clear();
                for (let i = 0; i < policyExtensions.length; i++) policyExtensions[i].clear?.();
                if (intent.clearMemoryOnIntentClear) intentMemory.clear();
                onIntentClear?.();
                locomotion.clear(agent, state);
                if (agent) agent.navStepPenalty = null;
            },
            onResetMode: (agent, state) => {
                arrivalStamper.reset();
                fleeLatch.clear();
                for (let i = 0; i < policyExtensions.length; i++) policyExtensions[i].clear?.();
                locomotion.clearDestination(agent, state);
            },
            onTransition: (agent, state) => {
                locomotion.clearDestination(agent, state);
            },
        });
        if (hasRangedShoot && instance.resolvedWeapon) states.shoot_enemy = createRangedShootIntentState(instance, () => instance.resolvedWeapon, this);
        this.brain = brain;
        this.agentCtx = agentCtx;
        this.locomotion = locomotion;
        this.intentMemory = intentMemory;
        this.intentContext = intentContext;
        this.headId = instance.headId;
        this.sprintWanted = false;
        this._lastDecisionContext = decisionContext;
        this.profile = profile;
        this.profileId = profileId;
        this.shared = shared;
        this.navWalkable = navWalkable;
        this.decisionSpec = decisionSpec;
        this.resolveSegmentCount = () => (state && instance ? getConnectedBodyIds(state.kinetic, instance.headId).length : 0);
        this.intentConfig = intent;
        this.fleeLatch = fleeLatch;
        this.policyExtensions = policyExtensions;
        this.arrivalStamper = arrivalStamper;
    }
    tick(agent, state, dtMs = 16) {
        this.intentContext.dtMs = dtMs;
        this.perceive(agent, state);
        const choice = this.transition(agent, state);
        const currentMode = this.getMode();
        if (currentMode !== "shoot_enemy" && this.agentCtx.instance.combatAction) {
            const action = this.agentCtx.instance.combatAction;
            if (action.phase === "reloading") {
                action.timerMs = Math.max(0, action.timerMs - dtMs);
                if (action.timerMs <= 0) resetInstanceRangedCombatAction(this.agentCtx.instance);
            } else if (action.phase === "reacting" || action.phase === "fire_delay") resetInstanceRangedCombatAction(this.agentCtx.instance);
        }
        this.sprintWanted = this._lastDecisionContext.sprintIntent.want === true;
        return choice;
    }
    getDestination() {
        return this.locomotion.getDestination();
    }
    getDecisionContext() {
        return this._lastDecisionContext;
    }
    resetMemory() {
        this.brain.clearMemory();
        this.intentMemory.clear();
    }
    clear(agent, state) {
        super.clear(agent, state);
        this.intentMemory.clear();
    }
    clearTrackedGoal() {
        const id = this.getTargetId();
        this.clearTargetId();
        if (id != null) this.intentMemory.clearTarget(id);
    }
    resetMode() {
        super.resetMode(null, null);
    }
    hasMoveTarget() {
        return this.locomotion.hasMoveTarget(null, null);
    }
    // ==========================================
    // Consolidated Class Methods (No Closures)
    // ==========================================
    resolveExploreCell(seeker, gameState, memory, exploreRng) {
        return resolveSnakeExploreCell(seeker, gameState, memory, exploreRng, this.navWalkable, this.shared);
    }
    seekArrivalRadius(mode, agent, target) {
        const huntMode = this.profile.intent?.huntMode ?? "seek_prey";
        const terminalHoming = this.shared.terminalHoming;
        const headRadius = getCirclePropRadius(this.agentCtx.instance.head);
        if (mode === "seek_ally") {
            const cohesion = this.profile.factionCohesion ?? {};
            return { arrivalRadius: cohesion.arrivalRadius ?? (this.profileId === AGENT_PROFILE.snake ? 32 : 24), lockOnTarget: true, terminalHoming };
        }
        const huntArrival = Math.max(2, headRadius * 0.25);
        if (mode === huntMode || mode === "seek_prey" || mode === "seek_enemy" || mode === "shoot_enemy") return { arrivalRadius: huntArrival, lockOnTarget: true, terminalHoming };
        if (target?.type !== "ammo_shard" && !isSnakeShardFood(target)) return { arrivalRadius: huntArrival, lockOnTarget: true, terminalHoming };
        return { arrivalRadius: this.agentCtx.instance.eatRadius, lockOnTarget: true, terminalHoming };
    }
    setFleeDestination(args) {
        const { agent, state, world, avoidCell } = args;
        const threat = world.decisionContext.known.threat;
        if (!threat) return null;
        const packOptions = this.intentConfig.fleePackBlend ? resolvePackSteeringOptions(world.decisionContext, this.agentCtx.instance) : null;
        const cell = pickFleeCell(agent, threat, state.obstacleGrid, this.navWalkable, this.shared.fleeTiles, avoidCell, packOptions);
        if (cell) {
            this.locomotion.setFlee(agent, state, cell);
            return cell;
        }
        if (this.intentConfig.fleeExploreFallback) {
            const exploreCell = this.resolveExploreCell(agent, state, this.brain.spatial, Math.random);
            if (exploreCell) this.locomotion.setExplore(agent, state, exploreCell);
            return exploreCell;
        }
        return null;
    }
    setCombatStrafeDestination(args) {
        const { agent, state, world, avoidCell } = args;
        const combat = world.decisionContext.combatState;
        const enemy = combat?.visibleEnemy ?? combat?.enemy;
        if (!enemy || combat.tooClose || !combat.hasLineOfSight) return null;
        const weapon = this.agentCtx.instance.resolvedWeapon;
        if (!weapon) return null;
        const movement = weapon.combatMovement ?? {};
        const cell = pickCombatStrafeCell(
            agent,
            enemy,
            state.obstacleGrid,
            this.navWalkable,
            {
                strafeTiles: movement.strafeTiles ?? 3,
                idealRangeFraction: movement.idealRangeFraction ?? 0.65,
                rangeBandCells: movement.rangeBandCells ?? 2,
                orbitBias: movement.orbitBias ?? 0,
                fleeRange: weapon.fleeRange,
                maxRange: weapon.maxRange,
            },
            avoidCell,
        );
        if (cell) {
            this.locomotion.setFlee(agent, state, cell);
            return cell;
        }
        return null;
    }
    resolveCommittedTarget(id, world) {
        if (id == null) return null;
        const known = world.decisionContext.known;
        for (let i = 0; i < this.intentConfig.committedSlots.length; i++) {
            const target = known[this.intentConfig.committedSlots[i]];
            if (target?.id === id) return target;
        }
        return null;
    }
    buildDecisionContext(input) {
        const { agent, state, visible, memoryWorld, committed, routeStatus, reachSteps } = input;
        const instance = this.agentCtx.instance;
        const profile = instance.profile;
        const decisionInput = {
            visibleWorld: visible,
            memoryWorld,
            memorySource: memoryWorld.memorySource,
            committedTarget: committed,
            routeStatus,
            reachSteps,
            cellSize: state.obstacleGrid.cellSize,
            shared: this.shared,
            foodFraction: instance.metabolism.getHunger(),
            combatStrafeMaxSpeed: instance.combatStrafeMaxSpeed ?? instance.walkMaxSpeed * 0.5,
            agentInstance: instance,
            instance: instance,
        };
        const fields = profile.intent.decisionFields ?? {};
        if (fields.seekerFaction) decisionInput.seekerFaction = agent.faction;
        if (fields.seekerSegmentCount) decisionInput.seekerSegmentCount = this.resolveSegmentCount();
        if (fields.session) decisionInput.session = state.sandbox.snakeGame;
        if (profile.weapon || hasRangedShootMode(profile)) {
            decisionInput.agent = agent;
            decisionInput.state = state;
            decisionInput.actionState = instance.combatAction;
            decisionInput.equippedWeapon = instance.equippedWeapon ?? null;
            decisionInput.weaponVisionRange = instance.visionRange.range;
        }
        return buildAgentDecisionContextInto(this._lastDecisionContext, this.decisionSpec, decisionInput, { includeScoreDetails: false });
    }
    applyFleePolicyLatch(fleeLatch, world, policyOut) {
        const ctx = world.decisionContext;
        const nextMode = ctx.chosenIntent?.mode ?? "explore";
        const targetId = ctx.chosenIntent?.targetId ?? null;
        const policyIn = { mode: nextMode, targetId, reason: ctx.chosenReason ?? null };
        const resolved = fleeLatch.apply(policyIn, { world, currentMode: this.getMode(), policy: policyIn });
        policyOut.mode = resolved.mode;
        policyOut.targetId = resolved.targetId ?? null;
        policyOut.reason = resolved.reason ?? null;
        if (resolved !== policyIn) {
            ctx.chosenIntent = resolved;
            ctx.chosenReason = resolved.reason ?? null;
            ctx.targetId = resolved.targetId ?? null;
            ctx.sprintIntent = deriveSprintIntent(resolved.mode, ctx, this.profile.sprint);
        }
        ctx.policyLatch = { ...(ctx.policyLatch ?? {}), flee: fleeLatch.snapshot() };
        return policyOut;
    }
}
