import { decelerateRoll, getKineticRollConfig } from "../../Sandbox/kineticRollActuator.js";
import { spawnPlacedSandboxProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { wakeKineticBody } from "../../Motion/kineticSleep.js";
import { rotateAngleTowards } from "../../Math/Angle.js";
import { createModePolicyLatch } from "../../AI/agentIntent/policyHysteresis.js";
import { deriveSprintIntent } from "../../AI/agents/deriveSprintIntent.js";
import { syncBallAgentFacingToTarget, DEFAULT_BALL_FACING_TURN_RAD_PER_SEC } from "./ballAgent.js";
import { getObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function resolveRangedWeapon(instance, profile) {
    return instance?.equippedWeapon ?? profile?.weapon ?? null;
}
export function hasRangedCombatCapability(instance, profile) {
    return !!(resolveRangedWeapon(instance, profile) || profile?.decision?.modes?.shoot_enemy);
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
export function hasLineOfSight(state, seeker, target) {
    const frame = getObserverVisionFrame(state);
    if (!frame) return false;
    const config = getSnakeGameConfig();
    return frame.isVisible(seeker, target.x, target.y, config.shared?.visionRange);
}
export function deriveRangedCombatState(ctx, input, profile) {
    const weapon = resolveRangedWeapon({ equippedWeapon: input.equippedWeapon }, profile);
    if (!weapon) return null;
    const maxRange = weapon.maxRange ?? profile.attackRange ?? 128;
    const fleeRange = profile.attackRange ?? weapon.fleeRange ?? 48;
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
    const los = visibleEnemy && seeker && state ? hasLineOfSight(state, seeker, visibleEnemy) : false;
    const inWeaponRange = distWorld != null && distWorld <= maxRange;
    const tooClose = distWorld != null && distWorld <= fleeRange;
    const phase = action?.phase ?? "idle";
    const onCooldown = action ? rangedCombatActionOnCooldown(action) : false;
    const busy = action ? rangedCombatActionIsBusy(action) : false;
    const canShoot = !!visibleEnemy && los && inWeaponRange && !tooClose && phase === "idle";
    const shouldBackOffEnemy = !!visibleEnemy && tooClose;
    return {
        enemy,
        enemyId: enemy?.id ?? null,
        visibleEnemy,
        visibleEnemyId: visibleEnemy?.id ?? null,
        distWorld,
        reachCells,
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
    const shooter = shooterInstance.head;
    const spawnDist = weapon.spawnDist ?? 4.5;
    const muzzleX = shooter.x + Math.cos(angle) * spawnDist;
    const muzzleY = shooter.y + Math.sin(angle) * spawnDist;
    const bulletSpeed = weapon.bulletSpeed ?? 500;
    const vx = Math.cos(angle) * bulletSpeed;
    const vy = Math.sin(angle) * bulletSpeed;
    const bullet = spawnPlacedSandboxProp(state, muzzleX, muzzleY, "gun_bullet", shooter.faction, angle);
    bullet._gunBullet = true;
    bullet._armed = true;
    bullet._shooterHeadId = shooterInstance.headId;
    bullet.snakeFoodValue = 0.5;
    bullet.vx = vx;
    bullet.vy = vy;
    bullet._lifetimeMs = 0;
    wakeKineticBody(bullet);
    const snakeGame = state.sandbox.snakeGame;
    if (snakeGame?.activeGunBulletIds) snakeGame.activeGunBulletIds.push(bullet.id);
}
function resolveLiveTarget(ctx) {
    if (ctx.target) return ctx.target;
    if (ctx.targetId == null) return null;
    return ctx.state.entityRegistry.getLive(ctx.targetId);
}
function aimRotationRadPerSec(weapon) {
    return weapon.aimRotationRadPerSec ?? DEFAULT_BALL_FACING_TURN_RAD_PER_SEC;
}
function combatStateCanAimAtTarget(ctx, target) {
    const combat = ctx.world.decisionContext.combatState;
    if (combat?.enemyId === target?.id) return combat.hasLineOfSight;
    return hasLineOfSight(ctx.state, ctx.agent, target);
}
function beginReaction(ctx, action, agent, target, weapon, dtMs) {
    action.phase = "reacting";
    action.targetId = target.id;
    action.timerMs = weapon.reactionMs ?? 1000;
    const targetAngle = Math.atan2(target.y - agent.y, target.x - agent.x);
    const initialAngle = agent.facing !== undefined && !Number.isNaN(agent.facing) ? agent.facing : targetAngle;
    const turnRadPerSec = aimRotationRadPerSec(weapon);
    const maxStep = turnRadPerSec * (dtMs / 1000);
    action.aimAngle = rotateAngleTowards(initialAngle, targetAngle, maxStep);
    agent.facing = action.aimAngle;
    decelerateRoll(agent, getKineticRollConfig(agent), ctx.state);
}
function tickReaction(ctx, instance, action, weapon, dtMs) {
    const agent = ctx.agent;
    decelerateRoll(agent, getKineticRollConfig(agent), ctx.state);
    action.timerMs = Math.max(0, action.timerMs - dtMs);
    const target = resolveLiveTarget(ctx);
    const turnRadPerSec = aimRotationRadPerSec(weapon);
    if (target && !target.isDead && combatStateCanAimAtTarget(ctx, target)) action.aimAngle = syncBallAgentFacingToTarget(agent, target, dtMs, turnRadPerSec);
    if (action.timerMs <= 0) {
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
    }
}
function tickFireDelay(ctx, instance, action, weapon, dtMs) {
    const agent = ctx.agent;
    decelerateRoll(agent, getKineticRollConfig(agent), ctx.state);
    action.timerMs = Math.max(0, action.timerMs - dtMs);
    const target = resolveLiveTarget(ctx);
    const turnRadPerSec = aimRotationRadPerSec(weapon);
    if (target && !target.isDead && combatStateCanAimAtTarget(ctx, target)) action.aimAngle = syncBallAgentFacingToTarget(agent, target, dtMs, turnRadPerSec);
    if (action.timerMs <= 0) {
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
    }
}
function tickReloading(ctx, action, weapon, dtMs) {
    const agent = ctx.agent;
    if (agent && ctx.state) decelerateRoll(agent, getKineticRollConfig(agent), ctx.state);
    action.timerMs = Math.max(0, action.timerMs - dtMs);
    const target = resolveLiveTarget(ctx);
    const turnRadPerSec = aimRotationRadPerSec(weapon);
    if (target && !target.isDead && combatStateCanAimAtTarget(ctx, target)) action.aimAngle = syncBallAgentFacingToTarget(agent, target, dtMs, turnRadPerSec);
    if (action.timerMs <= 0) resetRangedCombatAction(action);
}
export function createRangedShootIntentState(instance, resolveWeapon) {
    return {
        enter(ctx) {
            ctx.effects.clearDestination();
            const weapon = resolveWeapon(instance);
            if (!weapon) return;
            const action = instance.combatAction;
            const combat = ctx.world.decisionContext.combatState;
            if (action.phase === "idle" && combat?.canShoot && ctx.target) beginReaction(ctx, action, ctx.agent, ctx.target, weapon, ctx.dtMs ?? 16);
            else if (action.phase === "reacting") tickReaction(ctx, instance, action, weapon, 0);
        },
        update(ctx) {
            const weapon = resolveWeapon(instance);
            if (!weapon) return;
            const action = instance.combatAction;
            const dtMs = ctx.dtMs ?? 16;
            const combat = ctx.world.decisionContext.combatState;
            if (action.phase === "reloading") {
                tickReloading(ctx, action, weapon, dtMs);
                ctx.effects.holdDestination("shoot_reloading");
                if (ctx.policy.mode !== "shoot_enemy") ctx.effects.transitionTo(ctx.policy.mode, ctx.policy.reason ?? "reloading_done", ctx.policy.targetId);
                return;
            }
            if (action.phase === "fire_delay") {
                tickFireDelay(ctx, instance, action, weapon, dtMs);
                ctx.effects.holdDestination("shoot_fire_delay");
                return;
            }
            if (action.phase === "reacting") {
                tickReaction(ctx, instance, action, weapon, dtMs);
                ctx.effects.holdDestination("shoot_reacting");
                return;
            }
            if (!ctx.target || ctx.target.isDead) {
                ctx.effects.transitionTo(ctx.policy.mode, "target_lost", ctx.policy.targetId);
                return;
            }
            if (combat?.canShoot) {
                beginReaction(ctx, action, ctx.agent, ctx.target, weapon, dtMs);
                ctx.effects.holdDestination("shoot_start");
                return;
            }
            ctx.effects.holdDestination("shoot_wait");
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
