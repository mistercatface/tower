import { spawnPlacedSandboxProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
import { wakeKineticBody } from "../../../Motion/kineticSleep.js";
import { colRowToIndex } from "../../../Spatial/grid/GridUtils.js";
import { getObserverVisionFrame } from "../../../Navigation/perception/observerVisionFrame.js";
import { getAgentProfile, AGENT_PROFILE } from "../../../AI/agents/agentProfile.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { decelerateRoll, getKineticRollConfig } from "../../../Sandbox/kineticRollActuator.js";
import { resetGunAgentActionState } from "./gunAgentActionState.js";
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
function shortestAngleDistance(from, to) {
    let diff = to - from;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    return diff;
}
function rotateTowards(from, to, maxStep) {
    const diff = shortestAngleDistance(from, to);
    if (Math.abs(diff) <= maxStep) return to;
    return from + Math.sign(diff) * maxStep;
}
function resolveWeaponConfig() {
    return getAgentProfile(AGENT_PROFILE.gun).weapon ?? {};
}
function fireBullet(state, gunAgentInstance, angle, weapon) {
    const gunAgent = gunAgentInstance.head;
    const spawnDist = weapon.spawnDist ?? 4.5;
    const muzzleX = gunAgent.x + Math.cos(angle) * spawnDist;
    const muzzleY = gunAgent.y + Math.sin(angle) * spawnDist;
    const bulletSpeed = weapon.bulletSpeed ?? 500;
    const vx = Math.cos(angle) * bulletSpeed;
    const vy = Math.sin(angle) * bulletSpeed;
    const bullet = spawnPlacedSandboxProp(state, muzzleX, muzzleY, "gun_bullet", gunAgent.faction, angle);
    bullet._gunBullet = true;
    bullet._armed = true;
    bullet._shooterHeadId = gunAgentInstance.headId;
    bullet.snakeFoodValue = 0.5;
    bullet.vx = vx;
    bullet.vy = vy;
    bullet._lifetimeMs = 0;
    wakeKineticBody(bullet);
    const snakeGame = state.sandbox.snakeGame;
    if (snakeGame && snakeGame.activeGunBulletIds) snakeGame.activeGunBulletIds.push(bullet.id);
}
function updateFacingToVelocity(gunAgent, dtMs, aimRotationRadPerSec) {
    const vx = gunAgent.vx ?? 0;
    const vy = gunAgent.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed >= 0.25) {
        const moveAngle = Math.atan2(vy, vx);
        const maxStep = aimRotationRadPerSec * (dtMs / 1000);
        gunAgent.facing = rotateTowards(gunAgent.facing ?? moveAngle, moveAngle, maxStep);
    }
}
function resolveLiveTarget(ctx) {
    if (ctx.target) return ctx.target;
    if (ctx.targetId == null) return null;
    return ctx.state.entityRegistry.getLive(ctx.targetId);
}
function beginCharge(ctx, action, gunAgent, target, weapon, dtMs) {
    action.phase = "charging";
    action.targetId = target.id;
    action.timerMs = weapon.chargeMs ?? 1000;
    const targetAngle = Math.atan2(target.y - gunAgent.y, target.x - gunAgent.x);
    const initialAngle = gunAgent.facing !== undefined && !Number.isNaN(gunAgent.facing) ? gunAgent.facing : targetAngle;
    action.aimAngle = initialAngle;
    const maxStep = (weapon.aimRotationRadPerSec ?? Math.PI * 1.5) * (dtMs / 1000);
    action.aimAngle = rotateTowards(action.aimAngle, targetAngle, maxStep);
    gunAgent.facing = action.aimAngle;
    const config = getKineticRollConfig(gunAgent);
    decelerateRoll(gunAgent, config, ctx.state);
}
function tickCharge(ctx, instance, action, weapon, dtMs) {
    const gunAgent = ctx.agent;
    const config = getKineticRollConfig(gunAgent);
    decelerateRoll(gunAgent, config, ctx.state);
    action.timerMs = Math.max(0, action.timerMs - dtMs);
    const target = resolveLiveTarget(ctx);
    const aimRotationRadPerSec = weapon.aimRotationRadPerSec ?? Math.PI * 1.5;
    if (target && !target.isDead && hasLineOfSight(ctx.state, gunAgent, target)) {
        const targetAngle = Math.atan2(target.y - gunAgent.y, target.x - gunAgent.x);
        const maxStep = aimRotationRadPerSec * (dtMs / 1000);
        action.aimAngle = rotateTowards(action.aimAngle ?? targetAngle, targetAngle, maxStep);
        gunAgent.facing = action.aimAngle;
    }
    if (action.timerMs <= 0) {
        const angle = action.aimAngle ?? gunAgent.facing ?? 0;
        fireBullet(ctx.state, instance, angle, weapon);
        action.phase = "cooldown";
        action.timerMs = weapon.cooldownMs ?? 1500;
        action.targetId = null;
    }
}
function tickCooldown(ctx, action, weapon, dtMs) {
    action.timerMs = Math.max(0, action.timerMs - dtMs);
    if (action.timerMs <= 0) resetGunAgentActionState(action);
    updateFacingToVelocity(ctx.agent, dtMs, weapon.aimRotationRadPerSec ?? Math.PI * 1.5);
}
export function createGunShootIntentState(instance) {
    const weapon = resolveWeaponConfig();
    return {
        enter(ctx) {
            ctx.effects.clearDestination();
            const action = instance.combatAction;
            const combat = ctx.world.decisionContext.combatState;
            if (action.phase === "idle" && combat?.canShoot && ctx.target) beginCharge(ctx, action, ctx.agent, ctx.target, weapon, ctx.dtMs ?? 16);
            else if (action.phase === "charging") tickCharge(ctx, instance, action, weapon, 0);
        },
        update(ctx) {
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
            updateFacingToVelocity(ctx.agent, dtMs, weapon.aimRotationRadPerSec ?? Math.PI * 1.5);
            ctx.effects.holdDestination("shoot_wait");
        },
    };
}
export function clearGunAgentCombatAction(instance) {
    resetGunAgentActionState(instance.combatAction);
}
