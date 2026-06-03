import { NAV_PROFILES } from "../Config/Config.js";

function getSimTime(state) {
    return state?.gameTime ?? 0;
}

export class CombatNoneState {
    onEnter(enemy) {
        enemy.desiredX = 0;
        enemy.desiredY = 0;
    }

    update(enemy, dt, state, spatialFrame, target) {
        enemy.desiredX = 0;
        enemy.desiredY = 0;
        
        const now = getSimTime(state);
        if (now >= (enemy.combatData.decisionEndTime ?? 0)) {
            const dx = enemy.x - target.x;
            const dy = enemy.y - target.y;
            const dist = Math.hypot(dx, dy);
            
            const roll = Math.random();
            const safeDist = dist > 0.0001 ? dist : 0.0001;
            const dirX = -dx / safeDist;
            const dirY = -dy / safeDist;
            
            // Check if targeted by player (player aiming at enemy)
            const targetDirX = Math.cos(target.angle);
            const targetDirY = Math.sin(target.angle);
            const aimAlignment = (dx / safeDist) * targetDirX + (dy / safeDist) * targetDirY;
            const isTargeted = aimAlignment < -0.92; // target is looking towards enemy
            
            if (isTargeted && roll < 0.6 && now >= (enemy.combatData.dashCooldownEnd ?? 0)) {
                enemy.combatController.transitionTo("dive", { dirX, dirY });
                return;
            }
            
            if (roll < 0.3) {
                enemy.combatController.transitionTo("charge");
                return;
            }
            
            enemy.combatController.transitionTo("strafe", { roll, isTargeted, dirX, dirY });
        }
    }
}

export class CombatStrafeState {
    onEnter(enemy, data) {
        const now = getSimTime(enemy.lastGameState);
        enemy.combatData.decisionEndTime = now + 500;
        
        if (data) {
            const { roll, isTargeted, dirX, dirY } = data;
            if (roll < 0.9) {
                // Simplified strafe direction choice
                let newDir = enemy.combatData.strafeDir ?? (Math.random() < 0.5 ? 1 : -1);
                if (Math.random() < 0.2) newDir *= -1;
                enemy.combatData.strafeDir = newDir;
            }
        }
    }

    update(enemy, dt, state, spatialFrame, target) {
        const now = getSimTime(state);
        if (now >= enemy.combatData.decisionEndTime) {
            enemy.combatController.transitionTo("none");
            return;
        }
        
        const dx = enemy.x - target.x;
        const dy = enemy.y - target.y;
        const dist = Math.hypot(dx, dy);
        
        const safeDist = dist > 0.0001 ? dist : 0.0001;
        const dirX = -dx / safeDist;
        const dirY = -dy / safeDist;
        
        let perpX = -dirY * enemy.combatData.strafeDir;
        let perpY = dirX * enemy.combatData.strafeDir;
        
        let forwardBias = 0;
        const optimalRange = enemy.weapon?.range ?? 200;
        if (dist < optimalRange * 0.5) forwardBias = -0.3;
        else if (dist > optimalRange) forwardBias = 0.2;
        
        const strafeSpeed = Math.max(enemy.speed, 4.0) * 0.8;
        enemy.desiredX = perpX + dirX * forwardBias;
        enemy.desiredY = perpY + dirY * forwardBias;
    }
}

export class CombatChargeState {
    onEnter(enemy) {
        const now = getSimTime(enemy.lastGameState);
        enemy.combatData.decisionEndTime = now + 2000;
    }

    update(enemy, dt, state, spatialFrame, target) {
        const now = getSimTime(state);
        if (now >= enemy.combatData.decisionEndTime) {
            enemy.combatController.transitionTo("none");
            return;
        }
        
        state.navigation.steerTo(enemy, target.x, target.y, NAV_PROFILES.enemyToPlayer, state.flowFieldGrid);
    }
}

export class CombatDiveState {
    onEnter(enemy, data) {
        const { dirX, dirY } = data || { dirX: 0, dirY: 0 };
        const diveDir = Math.random() < 0.5 ? 1 : -1;
        
        const perpX = -dirY * diveDir;
        const perpY = dirX * diveDir;
        
        enemy.desiredX = perpX;
        enemy.desiredY = perpY;
        
        const now = getSimTime(enemy.lastGameState);
        enemy.combatData.dashEndTime = now + 400;
        enemy.combatData.dashCooldownEnd = now + 3000;
        enemy.combatData.decisionEndTime = now + 900;
        
        // Boost speed temporarily
        enemy.combatData.originalSpeed = enemy.speed;
        enemy.combatData.originalAccel = enemy.accelRate;
        enemy.speed *= 1.5;
        enemy.accelRate *= 3.0;
    }

    onExit(enemy) {
        enemy.desiredX = 0;
        enemy.desiredY = 0;
        if (enemy.combatData.originalSpeed) {
            enemy.speed = enemy.combatData.originalSpeed;
        }
        if (enemy.combatData.originalAccel) {
            enemy.accelRate = enemy.combatData.originalAccel;
        }
        const now = getSimTime(enemy.lastGameState);
        enemy.combatData.decisionEndTime = now + 200;
    }

    update(enemy, dt, state, spatialFrame, target) {
        const now = getSimTime(state);
        if (now >= enemy.combatData.dashEndTime) {
            enemy.combatController.transitionTo("none");
        }
    }
}

export const combatStates = {
    none: new CombatNoneState(),
    strafe: new CombatStrafeState(),
    charge: new CombatChargeState(),
    dive: new CombatDiveState(),
};

export class CombatController {
    constructor(enemy) {
        this.enemy = enemy;
        this.state = "none";
        this.currentState = combatStates[this.state];
    }

    transitionTo(newStateName, data = null) {
        if (this.state === newStateName) return;
        if (this.currentState?.onExit) this.currentState.onExit(this.enemy);
        this.state = newStateName;
        this.currentState = combatStates[this.state];
        if (this.currentState?.onEnter) this.currentState.onEnter(this.enemy, data);
    }

    update(dt, state, spatialFrame, target) {
        if (this.currentState?.update) {
            this.currentState.update(this.enemy, dt, state, spatialFrame, target);
        }
    }
}
