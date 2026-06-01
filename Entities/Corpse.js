import { Entity } from "./Entity.js";
import {
    captureCorpseBindFrame,
    clearActorKinematics,
    renderCorpseKinematicsBody,
} from "../Render/Kinematics/PlayerKinematicsRenderer.js";

const CORPSE_MAX_MS = 12000;
const CORPSE_FADE_MS = 2500;

export class Corpse extends Entity {
    static updateAll(state, dt) {
        if (!state.corpses?.length) return;
        for (let i = state.corpses.length - 1; i >= 0; i--) {
            const corpse = state.corpses[i];
            corpse.update(dt);
            if (corpse.isDead) {
                state.corpses.splice(i, 1);
            }
        }
    }

    static spawnFromActor(state, actor, _event, camera) {
        if (!state) return null;
        if (!state.corpses) state.corpses = [];

        const { bindFrame } = captureCorpseBindFrame(actor, camera);
        clearActorKinematics(actor);
        const corpse = new Corpse(actor, bindFrame);
        state.corpses.push(corpse);
        return corpse;
    }

    constructor(actor, bindFrame) {
        super(actor.x, actor.y, bindFrame.bodyRotation, false);
        this.actor = actor;
        this.radius = actor.radius;
        this.bindFrame = bindFrame;
        this.ageMs = 0;
        this.opacity = 1;
        this.isDead = false;
    }

    update(dt) {
        this.ageMs += dt;
        if (this.ageMs >= CORPSE_MAX_MS) {
            this.isDead = true;
            return;
        }

        const fadeStart = CORPSE_MAX_MS - CORPSE_FADE_MS;
        if (this.ageMs > fadeStart) {
            this.opacity = Math.max(0, 1 - (this.ageMs - fadeStart) / CORPSE_FADE_MS);
        }
        if (this.opacity <= 0.02) {
            this.isDead = true;
        }
    }

    isVisible(viewport) {
        if (!viewport?.isVisible) return true;
        return viewport.isVisible(this.x, this.y, this.radius * 3);
    }

    render(ctx, _renderer, state) {
        if (this.opacity <= 0) return;
        renderCorpseKinematicsBody(ctx, this, state);
    }
}
