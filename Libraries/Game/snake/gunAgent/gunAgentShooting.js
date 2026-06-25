import { spawnPlacedSandboxProp } from "../../../Sandbox/sandboxPlacedSpawn.js";
import { wakeKineticBody } from "../../../Motion/kineticSleep.js";
import { colRowToIndex } from "../../../Spatial/grid/GridUtils.js";
import { getObserverVisionFrame } from "../../../Navigation/perception/observerVisionFrame.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
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
export function tickGunAgentShooting(state, gunAgentInstance, dtMs) {
    const gunAgent = gunAgentInstance.head;
    if (gunAgent.isDead) return;
    // Cooldown management
    if (gunAgent._shootCooldownMs === undefined) gunAgent._shootCooldownMs = 0;
    if (gunAgent._shootCooldownMs > 0) {
        gunAgent._shootCooldownMs -= dtMs;
        return;
    }
    // Check target from autosim
    const autosim = gunAgentInstance.autosim;
    if (!autosim) return;
    const targetId = autosim.getTargetId();
    if (targetId == null) return;
    const target = state.entityRegistry.getLive(targetId);
    if (!target || target.isDead) return;
    // Line of Sight check
    if (!hasLineOfSight(state, gunAgent, target)) return;
    // Fire!
    // Compute aim vector
    const dx = target.x - gunAgent.x;
    const dy = target.y - gunAgent.y;
    const angle = Math.atan2(dy, dx);
    // Bullet spawn parameters: muzzle offset in front of gun agent's head
    // Gun agent head has radius 4. Bullet radius is 1.5.
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
    // Push bullet id to activeGunBulletIds list
    const snakeGame = state.sandbox.snakeGame;
    if (snakeGame && snakeGame.activeGunBulletIds) snakeGame.activeGunBulletIds.push(bullet.id);
    // Cooldown 1500ms
    gunAgent._shootCooldownMs = 1500;
}
