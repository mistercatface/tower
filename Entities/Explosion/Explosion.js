import { Entity } from "../Entity.js";
import { explosionSettings } from "../../Config/Config.js";
import { ExplosionStrategies } from "./ExplosionStrategies.js";
import { standardExplosionPhases } from "./ExplosionPhases.js";
import { transitionPhase } from "../EntityFsm.js";

export class Explosion extends Entity {
    static updateAll(state, dt, allEvents) {
        if (!state.explosions) return;

        for (let i = state.explosions.length - 1; i >= 0; i--) {
            const exp = state.explosions[i];
            if (exp.strategy?.update) exp.strategy.update(state, exp, dt, allEvents);
        }

        for (let i = state.explosions.length - 1; i >= 0; i--) {
            const exp = state.explosions[i];
            if (exp.strategy?.repel && !exp.isDead) {
                exp.strategy.repel(state, exp, dt);
            }
            if (exp.isDead) state.explosions.splice(i, 1);
        }
    }

    constructor(x, y, type, config) {
        super(x, y, 0, false);
        this.type = type;
        this.strategy = ExplosionStrategies[type];
        this.radius = config.radius || 0;
        this.maxRadius = config.maxRadius || 100;
        this.speed = config.speed || 300;
        this.damage = config.damage ?? explosionSettings.defaultDamage;
        this.hitTargets = new Set();
        this.lingerTimer = config.lingerTimer || 750;
        this.fadeTimer = config.fadeTimer || 250;
        this.opacity = 1.0;
        this.phaseData = {};
        this.phases = standardExplosionPhases;
        this.changePhase("expanding");
    }

    changePhase(name, phaseDataInit = null) {
        transitionPhase(this, this.phases, name, phaseDataInit);
    }
}
