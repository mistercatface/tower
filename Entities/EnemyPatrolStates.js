import { NAV_PROFILES } from "../Config/Config.js";

const PATROL_MIN_RADIUS = 20;
const PATROL_MAX_RADIUS = 64;
const PATROL_ARRIVAL_DIST = 20;
const PATROL_STUCK_FRAMES = 18;
const PATROL_DIRECT_FAIL_FRAMES = 8;

function pickWalkablePatrolTarget(enemy, state) {
    const obstacleGrid = state?.obstacleGrid;
    if (!obstacleGrid) {
        const angle = Math.random() * Math.PI * 2;
        const dist = PATROL_MIN_RADIUS + Math.random() * (PATROL_MAX_RADIUS - PATROL_MIN_RADIUS);
        enemy.patrolTargetX = enemy.x + Math.cos(angle) * dist;
        enemy.patrolTargetY = enemy.y + Math.sin(angle) * dist;
        state?.navigation?.clear(enemy);
        return true;
    }

    const hnav = state.hierarchicalNavigator;
    for (let i = 0; i < 16; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = PATROL_MIN_RADIUS + Math.random() * (PATROL_MAX_RADIUS - PATROL_MIN_RADIUS);
        const tx = enemy.x + Math.cos(angle) * dist;
        const ty = enemy.y + Math.sin(angle) * dist;
        if (obstacleGrid.isBlockedWorld(tx, ty)) continue;

        const cell = obstacleGrid.worldToGrid(tx, ty);
        if (obstacleGrid.isBlocked(cell.col, cell.row)) continue;

        const center = obstacleGrid.gridToWorld(cell.col, cell.row);
        if (hnav) {
            const path = hnav.findPath(enemy.x, enemy.y, center.x, center.y);
            if (!path || path.length < 2) continue;
        }

        enemy.patrolTargetX = center.x;
        enemy.patrolTargetY = center.y;
        state.navigation?.clear(enemy);
        enemy.patrolData.directFailFrames = 0;
        enemy.patrolData.stuckFrames = 0;
        return true;
    }

    enemy.patrolTargetX = null;
    enemy.patrolTargetY = null;
    return false;
}

function trackPatrolMovement(enemy) {
    const data = enemy.patrolData;
    const moved = Math.hypot(enemy.x - (data.lastX ?? enemy.x), enemy.y - (data.lastY ?? enemy.y));
    if (moved < 1.5) {
        data.stuckFrames = (data.stuckFrames ?? 0) + 1;
    } else {
        data.stuckFrames = 0;
    }
    data.lastX = enemy.x;
    data.lastY = enemy.y;
}

function shouldRepathPatrol(enemy, state) {
    const data = enemy.patrolData;
    const debug = state.navigation?.getDebugInfo(enemy);
    if (debug?.mode === "direct") {
        data.directFailFrames = (data.directFailFrames ?? 0) + 1;
    } else {
        data.directFailFrames = 0;
    }
    return (data.directFailFrames ?? 0) >= PATROL_DIRECT_FAIL_FRAMES
        || (data.stuckFrames ?? 0) >= PATROL_STUCK_FRAMES;
}

function updatePatrolLocomotion(enemy, dt, state, spatialFrame) {
    if (enemy.patrolTargetX == null || enemy.patrolTargetY == null) {
        if (!pickWalkablePatrolTarget(enemy, state)) {
            enemy.desiredX = 0;
            enemy.desiredY = 0;
        }
        return;
    }

    trackPatrolMovement(enemy);

    const distToTarget = Math.hypot(enemy.x - enemy.patrolTargetX, enemy.y - enemy.patrolTargetY);
    if (distToTarget < PATROL_ARRIVAL_DIST || shouldRepathPatrol(enemy, state)) {
        if (!pickWalkablePatrolTarget(enemy, state)) {
            enemy.desiredX = 0;
            enemy.desiredY = 0;
        }
        return;
    }

    state.navigation.steerTo(enemy, enemy.patrolTargetX, enemy.patrolTargetY, NAV_PROFILES.enemyPatrol, state.flowFieldGrid);
}

function getSimTime(state) {
    return state?.gameTime ?? 0;
}

export class PatrolCasualState {
    onEnter(enemy) {
        enemy.isEngaged = false;
        enemy.patrolTargetX = null;
        enemy.patrolTargetY = null;
        enemy.patrolData.lastX = enemy.x;
        enemy.patrolData.lastY = enemy.y;
        enemy.patrolData.stuckFrames = 0;
        enemy.patrolData.directFailFrames = 0;
    }

    update(enemy, dt, state, spatialFrame) {
        updatePatrolLocomotion(enemy, dt, state, spatialFrame);
    }
}

export class PatrolChaseState {
    onEnter(enemy) {
        enemy.patrolTargetX = null;
        enemy.patrolTargetY = null;
        enemy.combatData.decisionEndTime = getSimTime(enemy.lastGameState) + 400 + Math.random() * 400;
    }

    update(enemy, dt, state, spatialFrame) {
        const alertState = state.alertState;
        if (!alertState || !alertState.isChaseActive(state)) {
            enemy.isEngaged = false;
            enemy.patrolController.transitionTo("search");
            return;
        }

        enemy.isEngaged = true;

        const target = enemy.brain.personalTarget;
        if (target && !target.isDead) {
            const dist = Math.hypot(enemy.x - target.x, enemy.y - target.y);
            const engageRange = (enemy.weapon?.range ?? 200) * 1.5;
            if (dist <= engageRange) {
                enemy.combatController.update(dt, state, spatialFrame, target);
                return;
            }
        }

        if (enemy.combatController.state !== "none") {
            enemy.combatController.transitionTo("none");
        }

        const destX = target && !target.isDead ? target.x : alertState.lastKnownTargetX;
        const destY = target && !target.isDead ? target.y : alertState.lastKnownTargetY;
        if (destX != null && destY != null) {
            state.navigation.steerTo(enemy, destX, destY, NAV_PROFILES.enemyToPlayer, state.flowFieldGrid);
        }
    }
}

export class PatrolSearchState {
    onEnter(enemy) {
        enemy.isEngaged = false;
        enemy.patrolData.searchCount = 0;
        enemy.patrolData.maxSearchCount = 3 + Math.floor(Math.random() * 4);
        enemy.patrolTargetX = null;
        enemy.patrolTargetY = null;
        enemy.patrolData.lastX = enemy.x;
        enemy.patrolData.lastY = enemy.y;
        enemy.patrolData.stuckFrames = 0;
        enemy.patrolData.directFailFrames = 0;
    }

    update(enemy, dt, state, spatialFrame) {
        if (enemy.patrolData.searchCount >= enemy.patrolData.maxSearchCount) {
            enemy.patrolController.transitionTo("casual");
            return;
        }

        const distToTarget = enemy.patrolTargetX != null && enemy.patrolTargetY != null
            ? Math.hypot(enemy.x - enemy.patrolTargetX, enemy.y - enemy.patrolTargetY)
            : Infinity;

        if (distToTarget < PATROL_ARRIVAL_DIST) {
            enemy.patrolData.searchCount++;
            enemy.patrolTargetX = null;
            enemy.patrolTargetY = null;
        }

        updatePatrolLocomotion(enemy, dt, state, spatialFrame);
    }
}

export class PatrolAlertState {
    onEnter(enemy) {
        enemy.isEngaged = false;
        const params = enemy.patrolController.alertParams;
        enemy.brain.lookTargetX = params.x;
        enemy.brain.lookTargetY = params.y;
        enemy.patrolData.alertEndTime = getSimTime(enemy.lastGameState) + params.duration;
        enemy.desiredX = 0;
        enemy.desiredY = 0;
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.lastGameState?.navigation?.clear(enemy);
    }

    update(enemy, dt, state, spatialFrame) {
        enemy.desiredX = 0;
        enemy.desiredY = 0;

        const params = enemy.patrolController.alertParams;
        if (params.type === "VISUAL" && params.target) {
            enemy.brain.lookTargetX = params.target.x;
            enemy.brain.lookTargetY = params.target.y;
        }

        if (getSimTime(state) >= enemy.patrolData.alertEndTime) {
            if (params.type === "VISUAL" && params.target) {
                enemy.brain.personalTarget = params.target;
                state.alertState?.startChase(params.target.x, params.target.y, state);
            } else {
                state.alertState?.startChase(params.x, params.y, state);
            }
            enemy.patrolController.transitionTo("chase");
        }
    }

    onExit(enemy) {
        enemy.brain.lookTargetX = null;
        enemy.brain.lookTargetY = null;
    }
}

export const patrolStates = {
    casual: new PatrolCasualState(),
    chase: new PatrolChaseState(),
    search: new PatrolSearchState(),
    alert: new PatrolAlertState(),
};

export class PatrolController {
    constructor(enemy) {
        this.enemy = enemy;
        this.state = "casual";
        this.currentState = patrolStates[this.state];
        this.alertParams = { x: 0, y: 0, type: "NONE", target: null, duration: 0 };
    }

    transitionTo(newStateName) {
        if (this.state === newStateName) return;
        if (this.currentState?.onExit) this.currentState.onExit(this.enemy);
        this.state = newStateName;
        this.currentState = patrolStates[this.state];
        if (this.currentState?.onEnter) this.currentState.onEnter(this.enemy);
    }

    update(dt, state, spatialFrame) {
        if (this.currentState?.update) {
            this.currentState.update(this.enemy, dt, state, spatialFrame);
        }
    }
}
