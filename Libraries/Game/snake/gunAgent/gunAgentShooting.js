import { spawnPlacedSandboxProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
import { wakeKineticBody } from "../../../Motion/kineticSleep.js";
import { colRowToIndex } from "../../../Spatial/grid/GridUtils.js";
import { getObserverVisionFrame } from "../../../Navigation/perception/observerVisionFrame.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
import { decelerateRoll, getKineticRollConfig } from "../../../Sandbox/kineticRollActuator.js";
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
const AIM_ROTATION_SPEED_RAD_PER_SEC = Math.PI * 1.5;
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
function fireBullet(state, gunAgentInstance, angle) {
    const gunAgent = gunAgentInstance.head;
    const spawnDist = 4.5;
    const muzzleX = gunAgent.x + Math.cos(angle) * spawnDist;
    const muzzleY = gunAgent.y + Math.sin(angle) * spawnDist;
    const bulletSpeed = 500;
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
function updateFacingToVelocity(gunAgent, dtMs) {
    const vx = gunAgent.vx ?? 0;
    const vy = gunAgent.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed >= 0.25) {
        const moveAngle = Math.atan2(vy, vx);
        const maxStep = AIM_ROTATION_SPEED_RAD_PER_SEC * (dtMs / 1000);
        gunAgent.facing = rotateTowards(gunAgent.facing ?? moveAngle, moveAngle, maxStep);
    }
}
export function tickGunAgentShooting(state, gunAgentInstance, dtMs) {
    const gunAgent = gunAgentInstance.head;
    if (gunAgent.isDead) return;
    const autosim = gunAgentInstance.autosim;
    if (!autosim) return;
    // Cooldown management
    if (gunAgent._shootCooldownMs === undefined) gunAgent._shootCooldownMs = 0;
    if (gunAgent._shootCooldownMs > 0) {
        gunAgent._shootCooldownMs = Math.max(0, gunAgent._shootCooldownMs - dtMs);
        updateFacingToVelocity(gunAgent, dtMs);
        return;
    }
    // Only fire when in seek_enemy mode (combat)
    if (autosim.getMode() !== "seek_enemy") {
        gunAgent._shootChargeMs = 0;
        updateFacingToVelocity(gunAgent, dtMs);
        return;
    }
    // Charging phase
    if (gunAgent._shootChargeMs !== undefined && gunAgent._shootChargeMs > 0) {
        gunAgent._shootChargeMs = Math.max(0, gunAgent._shootChargeMs - dtMs);
        const config = getKineticRollConfig(gunAgent);
        decelerateRoll(gunAgent, config, state);
        if (autosim) {
            const targetId = autosim.getTargetId();
            if (targetId != null) {
                const target = state.entityRegistry.getLive(targetId);
                if (target && !target.isDead && hasLineOfSight(state, gunAgent, target)) {
                    const targetAngle = Math.atan2(target.y - gunAgent.y, target.x - gunAgent.x);
                    const maxStep = AIM_ROTATION_SPEED_RAD_PER_SEC * (dtMs / 1000);
                    gunAgent._shootAngle = rotateTowards(gunAgent._shootAngle ?? targetAngle, targetAngle, maxStep);
                    gunAgent.facing = gunAgent._shootAngle;
                }
            }
        }
        if (gunAgent._shootChargeMs <= 0) {
            const angle = gunAgent._shootAngle ?? gunAgent.facing ?? 0;
            fireBullet(state, gunAgentInstance, angle);
            gunAgent._shootCooldownMs = 1500;
        }
        return;
    }
    // Idle phase -> Check target from autosim
    const targetId = autosim.getTargetId();
    if (targetId == null) {
        updateFacingToVelocity(gunAgent, dtMs);
        return;
    }
    const target = state.entityRegistry.getLive(targetId);
    if (!target || target.isDead) {
        updateFacingToVelocity(gunAgent, dtMs);
        return;
    }
    // Line of Sight check
    if (!hasLineOfSight(state, gunAgent, target)) {
        updateFacingToVelocity(gunAgent, dtMs);
        return;
    }
    // Start charging!
    gunAgent._shootChargeMs = 1000;
    const config = getKineticRollConfig(gunAgent);
    decelerateRoll(gunAgent, config, state);
    const targetAngle = Math.atan2(target.y - gunAgent.y, target.x - gunAgent.x);
    const initialAngle = gunAgent.facing !== undefined && !isNaN(gunAgent.facing) ? gunAgent.facing : targetAngle;
    gunAgent._shootAngle = initialAngle;
    const maxStep = AIM_ROTATION_SPEED_RAD_PER_SEC * (dtMs / 1000);
    gunAgent._shootAngle = rotateTowards(gunAgent._shootAngle, targetAngle, maxStep);
    gunAgent.facing = gunAgent._shootAngle;
}
