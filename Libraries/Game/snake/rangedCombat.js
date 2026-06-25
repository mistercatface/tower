import { decelerateRoll, getKineticRollConfig } from "../../Sandbox/kineticRollActuator.js";
import { spawnPlacedSandboxProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { wakeKineticBody } from "../../Motion/kineticSleep.js";
import { rotateAngleTowards, syncBallAgentFacingToTarget, DEFAULT_BALL_FACING_TURN_RAD_PER_SEC } from "./ballAgent.js";
import { colRowToIndex } from "../../Spatial/grid/GridUtils.js";
import { getObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function resolveRangedWeapon(instance, profile) {
    return instance?.equippedWeapon ?? profile?.weapon ?? null;
}
export function hasRangedCombatCapability(instance, profile) {
    return !!(resolveRangedWeapon(instance, profile) || profile?.decision?.modes?.shoot_enemy);
}
export function createRangedCombatActionState() {
    return { phase: "idle", targetId: null, timerMs: 0, aimAngle: 0 };
}
export function resetRangedCombatAction(action) {
    if (!action) return;
    action.phase = "idle";
    action.targetId = null;
    action.timerMs = 0;
    action.aimAngle = 0;
}
export function rangedCombatActionOnCooldown(action) {
    return action?.phase === "cooldown" && action.timerMs > 0;
}
export function rangedCombatActionIsBusy(action) {
    return action?.phase === "charging" || rangedCombatActionOnCooldown(action);
}
export function hasLineOfSight(state, seeker, target) {
    const frame = getObserverVisionFrame(state);
    if (!frame) return false;
    const config = getSnakeGameConfig();
    const vision = frame.ensureHeadVision(seeker, config.shared?.visionRange);
    if (!vision || !vision.cellSet) return false;
    const grid = state.obstacleGrid;
    const targetCol = grid.worldCol(target.x);
    const targetRow = grid.worldRow(target.y);
    return vision.cellSet.has(colRowToIndex(targetCol, targetRow, grid.cols));
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
    const los = enemy && seeker && state ? hasLineOfSight(state, seeker, enemy) : false;
    const inWeaponRange = distWorld != null && distWorld <= maxRange;
    const tooClose = distWorld != null && distWorld <= fleeRange;
    const phase = action?.phase ?? "idle";
    const onCooldown = action ? rangedCombatActionOnCooldown(action) : false;
    const busy = action ? rangedCombatActionIsBusy(action) : false;
    const canShoot = !!visibleEnemy && los && inWeaponRange && !tooClose && !onCooldown && phase !== "charging";
    return { enemy, visibleEnemy, distWorld, reachCells, hasLineOfSight: los, inWeaponRange, tooClose, phase, onCooldown, busy, canShoot, weapon };
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
function beginCharge(ctx, action, agent, target, weapon, dtMs) {
    action.phase = "charging";
    action.targetId = target.id;
    action.timerMs = weapon.chargeMs ?? 1000;
    const targetAngle = Math.atan2(target.y - agent.y, target.x - agent.x);
    const initialAngle = agent.facing !== undefined && !Number.isNaN(agent.facing) ? agent.facing : targetAngle;
    const turnRadPerSec = aimRotationRadPerSec(weapon);
    const maxStep = turnRadPerSec * (dtMs / 1000);
    action.aimAngle = rotateAngleTowards(initialAngle, targetAngle, maxStep);
    agent.facing = action.aimAngle;
    decelerateRoll(agent, getKineticRollConfig(agent), ctx.state);
}
function tickCharge(ctx, instance, action, weapon, dtMs) {
    const agent = ctx.agent;
    decelerateRoll(agent, getKineticRollConfig(agent), ctx.state);
    action.timerMs = Math.max(0, action.timerMs - dtMs);
    const target = resolveLiveTarget(ctx);
    const turnRadPerSec = aimRotationRadPerSec(weapon);
    if (target && !target.isDead && hasLineOfSight(ctx.state, agent, target)) action.aimAngle = syncBallAgentFacingToTarget(agent, target, dtMs, turnRadPerSec);
    if (action.timerMs <= 0) {
        const angle = action.aimAngle ?? agent.facing ?? 0;
        fireBullet(ctx.state, instance, angle, weapon);
        action.phase = "cooldown";
        action.timerMs = weapon.cooldownMs ?? 1500;
        action.targetId = null;
    }
}
function tickCooldown(ctx, action, weapon, dtMs) {
    action.timerMs = Math.max(0, action.timerMs - dtMs);
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
            if (action.phase === "idle" && combat?.canShoot && ctx.target) beginCharge(ctx, action, ctx.agent, ctx.target, weapon, ctx.dtMs ?? 16);
            else if (action.phase === "charging") tickCharge(ctx, instance, action, weapon, 0);
        },
        update(ctx) {
            const weapon = resolveWeapon(instance);
            if (!weapon) return;
            const action = instance.combatAction;
            const dtMs = ctx.dtMs ?? 16;
            const combat = ctx.world.decisionContext.combatState;
            if (action.phase === "cooldown") {
                tickCooldown(ctx, action, weapon, dtMs);
                if (ctx.policy.mode !== "shoot_enemy") ctx.effects.transitionTo(ctx.policy.mode, ctx.policy.reason ?? "cooldown_done", ctx.policy.targetId);
                return;
            }
            if (action.phase === "charging") {
                tickCharge(ctx, instance, action, weapon, dtMs);
                ctx.effects.holdDestination("shoot_charge");
                return;
            }
            if (!ctx.target || ctx.target.isDead) {
                ctx.effects.transitionTo(ctx.policy.mode, "target_lost", ctx.policy.targetId);
                return;
            }
            if (combat?.canShoot) {
                beginCharge(ctx, action, ctx.agent, ctx.target, weapon, dtMs);
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
