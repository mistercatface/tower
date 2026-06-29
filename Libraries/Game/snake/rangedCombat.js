import { spawnGunBulletProjectile } from "./gunAgent/gunBulletSystem.js";
import { angleDelta, rotateAngleTowards } from "../../Math/Angle.js";
import { createModePolicyLatch } from "../../AI/agentIntent/policyHysteresis.js";
import { deriveSprintIntent } from "../../AI/agents/deriveSprintIntent.js";
import { syncBallAgentFacingToTarget, DEFAULT_BALL_FACING_TURN_RAD_PER_SEC } from "./ballAgent.js";
import { getObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
const DEFAULT_FIRE_AIM_TOLERANCE_RAD = 0.08;
const DEFAULT_WEAPON_MAX_RANGE = 128;
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
export function createRangedCombatActionState() {
    return { phase: "idle", targetId: null, timerMs: 0, aimAngle: 0, shotsFired: 0 };
}
export function resetRangedCombatAction(action) {
    if (!action) return;
    action.phase = "idle";
    action.targetId = null;
    action.timerMs = 0;
    action.aimAngle = 0;
    action.shotsFired = 0;
}
export function rangedCombatActionOnCooldown(action) {
    return action?.phase === "fire_delay" || action?.phase === "reloading";
}
export function rangedCombatActionIsBusy(action) {
    return action?.phase === "reacting" || action?.phase === "fire_delay" || action?.phase === "reloading";
}
export function deriveRangedCombatState(ctx, input, profile) {
    // 1. Resolve weapon properties based on equip state and profile.
    const weapon = resolveRangedWeapon({ equippedWeapon: input.equippedWeapon }, profile, input.weaponVisionRange);
    if (!weapon) return null;
    const maxRange = weapon.maxRange;
    const fleeRange = weapon.fleeRange;
    const action = input.actionState ?? null;
    const seeker = input.agent;
    const state = input.state;
    // 2. Identify the active target (visible enemy, falling back to remembered target).
    const visibleEnemy = ctx.visible.enemy;
    const knownEnemy = ctx.known.enemy;
    const enemy = visibleEnemy ?? knownEnemy;
    // 3. Compute target facts (straight-line distance).
    let distWorld = null;
    if (enemy && seeker) {
        const dx = enemy.x - seeker.x;
        const dy = enemy.y - seeker.y;
        distWorld = Math.hypot(dx, dy);
    }
    const reachCells = ctx.reachSteps?.enemy;
    // 4. Compute physical speeds and thresholds for accuracy / decision modeling.
    const agentSpeed = seeker ? Math.hypot(seeker.vx ?? 0, seeker.vy ?? 0) : 0;
    const combatStrafeMaxSpeed = input.combatStrafeMaxSpeed ?? 50;
    // 5. Query environment facts (line of sight, range boundaries).
    const los = visibleEnemy ? getObserverVisionFrame(state).isVisible(seeker, visibleEnemy.x, visibleEnemy.y) : false;
    const inWeaponRange = distWorld != null && distWorld <= maxRange;
    const tooClose = distWorld != null && distWorld <= fleeRange;
    // 6. Resolve FSM combat action phase.
    const phase = action?.phase ?? "idle";
    const onCooldown = action ? rangedCombatActionOnCooldown(action) : false;
    const busy = action ? rangedCombatActionIsBusy(action) : false;
    // 7. Shoot Eligibility: Can shoot if target is visible, in range, has LOS, weapon is idle, and we have ammo.
    // NOTE: We allow shooting at close range (no !tooClose guard) so close-quarters combat works properly.
    const hasAmmo = input.agentInstance ? input.agentInstance.ammo > 0 : input.instance ? input.instance.ammo > 0 : true;
    const canShoot = !!visibleEnemy && los && inWeaponRange && phase === "idle" && hasAmmo;
    // 8. Asymmetric Back-Off / Flee logic:
    // We only back off if too close AND either:
    // a) We are reloading (defenseless).
    // b) We are idle, but the enemy has ID advantage (prevents mutual fleeing / synchronized dancing).
    // Agents actively aiming or firing will stand their ground.
    const hasIdAdvantage = seeker && enemy && seeker.id != null && enemy.id != null ? seeker.id > enemy.id : false;
    const shouldBackOffEnemy = !!visibleEnemy && tooClose && (phase === "reloading" || (phase === "idle" && !hasIdAdvantage));
    return {
        enemy,
        enemyId: enemy?.id ?? null,
        visibleEnemy,
        visibleEnemyId: visibleEnemy?.id ?? null,
        distWorld,
        reachCells,
        agentSpeed,
        combatStrafeMaxSpeed,
        hasLineOfSight: los,
        inWeaponRange,
        tooClose,
        shouldBackOffEnemy,
        phase,
        onCooldown,
        busy,
        canShoot,
        weapon,
    };
}
function fireBullet(state, shooterInstance, angle, weapon) {
    spawnGunBulletProjectile(state, shooterInstance, angle, weapon);
}
function resolveLiveTarget(ctx) {
    if (ctx.target) return ctx.target;
    if (ctx.targetId == null) return null;
    return ctx.state.entityRegistry.getLive(ctx.targetId);
}
// --- Aiming Calculations & Movement-Affected Penalties ---
function getAimTurnSpeedMultiplier(combat) {
    if (!combat) return 1;
    const speed = combat.agentSpeed ?? 0;
    const strafeSpeed = combat.combatStrafeMaxSpeed ?? 50;
    if (speed <= strafeSpeed) return 1;
    // Linearly reduce aiming speed by up to 50% as velocity exceeds the strafe threshold.
    const excess = speed - strafeSpeed;
    const penaltyScale = Math.min(0.5, excess / strafeSpeed);
    return 1 - penaltyScale;
}
function getAimToleranceMultiplier(combat) {
    if (!combat) return 1;
    const speed = combat.agentSpeed ?? 0;
    const strafeSpeed = combat.combatStrafeMaxSpeed ?? 50;
    if (speed <= strafeSpeed) return 1;
    // Proportional accuracy degradation: widen aiming tolerance up to 2.5x.
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
    // 1. Target must be alive and registered
    if (!target || target.isDead) {
        resetRangedCombatAction(action);
        return false;
    }
    // 2. Target must be within weapon max range and in line of sight
    const hasLos = combatStateCanAimAtTarget(ctx, target);
    const inRange = targetInWeaponWindow(ctx.agent, target, weapon);
    if (!hasLos || !inRange) {
        // Increment frame-based lost timer
        action.lostLosMs = (action.lostLosMs ?? 0) + dtMs;
        const reachedToleranceLimit = action.lostLosMs > (weapon.aimLostTolerateMs ?? 200);
        if (reachedToleranceLimit) resetRangedCombatAction(action);
        return false;
    }
    // Reset lost timer upon clear visibility
    action.lostLosMs = 0;
    return true;
}
function shotReady(ctx, action, weapon, target, dtMs = 16) {
    if (!verifyTargetValid(ctx, action, weapon, target, dtMs)) return false;
    return aimReadyForShot(ctx, ctx.agent, target, action, weapon);
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
        } else resetRangedCombatAction(action);
}
function tickReloading(ctx, action, weapon, dtMs) {
    const agent = ctx.agent;
    action.timerMs = Math.max(0, action.timerMs - dtMs);
    const target = resolveLiveTarget(ctx);
    const turnRadPerSec = getAimRotationSpeed(ctx, weapon);
    if (target && !target.isDead && combatStateCanAimAtTarget(ctx, target)) action.aimAngle = syncBallAgentFacingToTarget(agent, target, dtMs, turnRadPerSec);
    if (action.timerMs <= 0) resetRangedCombatAction(action);
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
function maintainCombatStrafe(ctx, strafeState, weapon) {
    const combat = ctx.world.decisionContext.combatState;
    if (!combat?.hasLineOfSight || combat.tooClose || !ctx.target || ctx.target.isDead) {
        strafeState.lastCell = null;
        strafeState.repickAt = 0;
        ctx.effects.clearDestination();
        return;
    }
    if (!shouldRefreshCombatStrafe(ctx, strafeState, weapon)) {
        ctx.effects.holdDestination("shoot_strafe");
        return;
    }
    const cell = ctx.effects.setCombatStrafeDestination(strafeState.lastCell);
    if (cell) {
        strafeState.lastCell = cell;
        strafeState.repickAt = ctx.ticks + strafeRepickTicks(weapon);
        ctx.effects.setLastTransition("shoot_strafe");
        return;
    }
    ctx.effects.holdDestination("shoot_strafe_hold");
}
// --- Ranged Shoot FSM State ---
export function createRangedShootIntentState(instance, resolveWeapon) {
    const strafeState = { lastCell: null, repickAt: 0 };
    return {
        /**
         * Executed upon entering the shoot_enemy state.
         */
        enter(ctx) {
            const weapon = resolveWeapon(instance);
            if (!weapon) return;
            const action = instance.combatAction;
            const combat = ctx.world.decisionContext.combatState;
            // 1. Maintain or initialize combat strafing movement
            maintainCombatStrafe(ctx, strafeState, weapon);
            // 2. Start aiming reaction if the weapon is idle and ready to shoot
            if (action.phase === "idle" && combat?.canShoot && ctx.target) beginReaction(ctx, action, ctx.agent, ctx.target, weapon, ctx.dtMs ?? 16);
            else if (action.phase === "reacting")
                // Instantly tick reaction progress for the initial frame
                tickAimAndFire(ctx, instance, action, weapon, 0);
        },
        /**
         * Executed every frame update while in shoot_enemy state.
         */
        update(ctx) {
            const weapon = resolveWeapon(instance);
            if (!weapon) return;
            const action = instance.combatAction;
            const dtMs = ctx.dtMs ?? 16;
            const combat = ctx.world.decisionContext.combatState;
            // Step 1: Tick the current combat action phase
            switch (action.phase) {
                case "reloading":
                    tickReloading(ctx, action, weapon, dtMs);
                    maintainCombatStrafe(ctx, strafeState, weapon);
                    // Transition out if the decision logic has shifted away from shooting
                    if (ctx.policy.mode !== "shoot_enemy") ctx.effects.transitionTo(ctx.policy.mode, ctx.policy.reason ?? "reloading_done", ctx.policy.targetId);
                    return;
                case "fire_delay":
                case "reacting":
                    tickAimAndFire(ctx, instance, action, weapon, dtMs);
                    maintainCombatStrafe(ctx, strafeState, weapon);
                    return;
            }
            // Step 2: Handle target loss (dead or gone)
            if (!ctx.target || ctx.target.isDead) {
                strafeState.lastCell = null;
                strafeState.repickAt = 0;
                ctx.effects.transitionTo(ctx.policy.mode, "target_lost", ctx.policy.targetId);
                return;
            }
            // Step 3: Initiate shooting reaction if weapon is idle and eligible
            if (combat?.canShoot) beginReaction(ctx, action, ctx.agent, ctx.target, weapon, dtMs);
            // Step 4: Continue maintaining lateral movement/positioning
            maintainCombatStrafe(ctx, strafeState, weapon);
        },
    };
}
export function resetInstanceRangedCombatAction(instance) {
    resetRangedCombatAction(instance.combatAction);
}
export function createRangedCombatPolicyExtension() {
    const shootLatch = createModePolicyLatch({
        mode: "shoot_enemy",
        minTicks: 0,
        holdReason: "shoot_held",
        refreshWhen: ({ world }) => {
            const combat = world.decisionContext.combatState;
            if (!combat) return false;
            if (rangedCombatActionIsBusy(combat)) return true;
            return combat.canShoot;
        },
        canRelease: ({ world, policy }) => {
            const combat = world.decisionContext.combatState;
            if (!combat) return true;
            if (rangedCombatActionIsBusy(combat)) return false;
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
