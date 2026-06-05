import { Enemy } from "./Enemy.js";
import { actorStates } from "./ActorStates.js";
import { integrateSteering, updateSeparation } from "../Libraries/Motion/index.js";
import { PhysicsSystem } from "../Spatial/Motion/PhysicsSystem.js";

export class ZombieChargePrepareState {
    update(enemy, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state) {
        if (enemy.chargeCooldown > 0) {
            enemy.chargeCooldown -= dt;
        }

        const distToTarget = Math.hypot(enemy.x - target.x, enemy.y - target.y);
        enemy.isEngaged = distToTarget <= target.radius + enemy.weapon.range;

        // Zombie: No backing away or repositioning: always steer directly towards target using navigation
        enemy.calculateSteering(target, state);

        updateSeparation(enemy, spatialFrame);
        integrateSteering(enemy, dt, { ignoreSeparation: false, shouldMove: true });
        PhysicsSystem.resolveWallCollisions(enemy, spatialFrame, state);

        const nextToTarget = distToTarget <= target.radius + enemy.radius + 10;

        if (enemy.chargeCooldown <= 0 && nextToTarget) {
            return enemy.changeStateAndUpdate("charging_windup", {
                timer: 1000,
            }, dt, target, flowFieldGrid, walls, missiles, spatialFrame, scheduler, state);
        }

        return false;
    }
}

export const zombieActorStates = {
    ...actorStates,
    charging_prepare: new ZombieChargePrepareState(),
};

export class Zombie extends Enemy {
    constructor(x, y, enemyType, combatStats, baseUpgradeDefs, reward) {
        super(x, y, enemyType, combatStats, baseUpgradeDefs, reward);
        this.states = zombieActorStates;
        this.currentState = this.states.navigating;
    }
}

Enemy.registerSubclass("zombie", Zombie);
