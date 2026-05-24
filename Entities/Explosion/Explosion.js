import { Entity } from "../Entity.js";
import { ExplosionStrategies } from "./ExplosionStrategies.js";

export class Explosion extends Entity {
    static updateAll(state, dt, allEvents) {
        if (!state.explosions) return;
        for (let i = state.explosions.length - 1; i >= 0; i--) {
            const exp = state.explosions[i];
            if (exp.strategy && exp.strategy.update) exp.strategy.update(state, exp, dt, allEvents);
            if (exp.isDead) state.explosions.splice(i, 1);
        }
    }

    static renderAll(ctx, state, renderer) {
        if (!state.explosions) return;
        for (const exp of state.explosions) {
            if (exp.strategy && exp.strategy.render) {
                exp.strategy.render(ctx, exp, state, renderer);
            }
        }
    }

    constructor(x, y, type, config) {
        super(x, y, 0, false);
        this.type = type;
        this.strategy = ExplosionStrategies[type];
        this.radius = config.radius || 0;
        this.maxRadius = config.maxRadius || 100;
        this.speed = config.speed || 300;
        this.damage = config.damage || 50;
        this.hitTargets = new Set();
        this.phase = "expanding";
        this.lingerTimer = config.lingerTimer || 750;
        this.fadeTimer = config.fadeTimer || 250;
        this.opacity = 1.0;
    }
}