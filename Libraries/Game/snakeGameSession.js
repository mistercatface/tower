import { HpaNavSession, canStepEitherDirection } from "../Navigation/navigation.js";
import { forEachCardinalNeighborIdx, gridCellLayout } from "../Spatial/spatial.js";
import { driveGroundNav, buildHpaGroundNavPathSettings } from "../Sandbox/sandbox.js";
import { getKineticRollConfig, steerRollToward, physicsSettings } from "../Physics/physics.js";

const FLEE_BFS_QUEUE = [];

function pickFleeTargetWorld(state, enemyHead, player) {
    const grid = state.obstacleGrid;
    const topology = state.nav.topology;
    const layout = gridCellLayout(grid);
    const startIdx = grid.worldToIdx(enemyHead.x, enemyHead.y);
    if (startIdx < 0) return null;
    const size = grid.cols * grid.rows;
    let visited = state._snakeFleeVisited;
    if (!visited || visited.length < size) {
        visited = new Uint8Array(size);
        state._snakeFleeVisited = visited;
    } else {
        visited.fill(0);
    }
    const queue = FLEE_BFS_QUEUE;
    queue.length = 0;
    queue.push(startIdx);
    visited[startIdx] = 1;
    const playerX = player.x;
    const playerY = player.y;
    let bestIdx = startIdx;
    let bestDist = -1;
    for (let qi = 0; qi < queue.length && qi < 96; qi++) {
        const idx = queue[qi];
        const cx = grid.gridCenterXByIdx(idx);
        const cy = grid.gridCenterYByIdx(idx);
        const dist = Math.hypot(cx - playerX, cy - playerY);
        if (dist > bestDist) {
            bestDist = dist;
            bestIdx = idx;
        }
        forEachCardinalNeighborIdx(idx, layout, (nIdx) => {
            if (visited[nIdx]) return;
            if (!canStepEitherDirection(grid, topology, idx, nIdx)) return;
            visited[nIdx] = 1;
            queue.push(nIdx);
        });
    }
    return { x: grid.gridCenterXByIdx(bestIdx), y: grid.gridCenterYByIdx(bestIdx) };
}

function tickEnemyFleeFromPlayer(state, enemyHead, player, hpaNav, dtMs) {
    if (!enemyHead || enemyHead.isDead || !player || player.isDead) return;
    const fleeTarget = pickFleeTargetWorld(state, enemyHead, player);
    if (!fleeTarget) return;
    const config = getKineticRollConfig(enemyHead, { stopRadius: physicsSettings.groundNavHpa.stopRadius });
    const pathSettings = buildHpaGroundNavPathSettings(state, enemyHead, config.stopRadius);
    const { vx, vy, steering } = driveGroundNav({ prop: enemyHead, targetWorld: fleeTarget, nav: hpaNav, state, dtMs, pathSettings });
    if (!steering) return;
    if (vx === 0 && vy === 0) return;
    steerRollToward(enemyHead, vx, vy, config, steering?.desiredSpeed);
}

export function createSnakeGameSession(state) {
    let player = null;
    let enemyHead = null;
    const hpaNav = new HpaNavSession();
    return {
        bind(ctx) {
            player = ctx.boid ?? null;
            enemyHead = ctx.enemyChain?.head ?? null;
            hpaNav.reset(state);
        },
        tick(dt) {
            tickEnemyFleeFromPlayer(state, enemyHead, player, hpaNav, dt);
        },
    };
}
