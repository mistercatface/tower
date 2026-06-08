import { Entity } from "./Entity.js";
import { applyRagdollImpulse, updateRagdoll } from "../Libraries/Kinematics/ragdoll/physics.js";
import { checkRagdollHit, ragdollPartToWorld } from "../Libraries/Kinematics/ragdoll/hitTest.js";
import { seedRagdollBloodOnDeath, updateBloodEffects, addRagdollBleedEmitter } from "../Libraries/Render/Characters/ragdoll/blood.js";
import { createObstacleWallChecker, createRagdollState, resolveDeathImpact } from "../Libraries/Kinematics/ragdoll/fromActor.js";
import { getViewCenter } from "../Core/GamePorts.js";
import { captureActorRigForRagdoll, renderCorpseKinematicsBody } from "../Libraries/Render/Characters/actorKinematicsRenderer.js";
import { CombatParticles } from "../Libraries/Render/CombatParticles.js";
const CORPSE_MAX_MS = 12000;
const CORPSE_FADE_MS = 2500;
export class RagdollCorpse extends Entity {
    static tryProjectileHit(state, projectile) {
        if (!state.ragdollCorpses?.length || projectile.isDead) return false;
        for (const corpse of state.ragdollCorpses) {
            if (corpse.isDead) continue;
            if (corpse.ageMs > 250) continue;
            const hit = checkRagdollHit(corpse, projectile.x, projectile.y, projectile.radius);
            if (!hit) continue;
            const { rig, config } = corpse.kinematicsCtx;
            const forceScale = Math.max(8, (projectile.speed ?? 100) * 0.035);
            const fx = Math.cos(projectile.angle) * forceScale;
            const fy = -forceScale * 0.25;
            const fz = Math.sin(projectile.angle) * forceScale;
            applyRagdollImpulse(corpse.ragdoll, fx, fy, fz, hit.part, rig, corpse.ragdoll.rotation, config, 22, hit.offsetT ?? 0.5);
            addRagdollBleedEmitter(corpse.ragdoll, hit.part, rig, 0.8);
            const { x: bx, y: by } = ragdollPartToWorld(corpse, hit.part);
            CombatParticles.spawnBlood(state, bx, by, { impactAngle: projectile.angle, count: 4, sizePx: 2 });
            if (projectile.penetration > 0) projectile.penetration--;
            else {
                CombatParticles.spawnImpactSparks(state, projectile.x, projectile.y, { impactAngle: projectile.angle });
                projectile.isDead = true;
            }
            return true;
        }
        return false;
    }
    static updateAll(state, dt, spatialFrame) {
        if (!state.ragdollCorpses?.length) return;
        const viewCenter = getViewCenter(state);
        const wallChecker = createObstacleWallChecker(state);
        for (let i = state.ragdollCorpses.length - 1; i >= 0; i--) {
            const corpse = state.ragdollCorpses[i];
            corpse.update(dt, state, spatialFrame, viewCenter, wallChecker);
            if (corpse.isDead) state.ragdollCorpses.splice(i, 1);
        }
    }
    static spawnFromActor(state, actor, event, camera) {
        if (!state) return null;
        if (!state.ragdollCorpses) state.ragdollCorpses = [];
        const capture = captureActorRigForRagdoll(actor, camera);
        const { config, rig } = capture.kinematics.bundle;
        const impact = resolveDeathImpact(actor, event);
        const ragdoll = createRagdollState(capture.bindFrame.rigData, capture.bindFrame.bodyRotation, impact, config, rig);
        seedRagdollBloodOnDeath(ragdoll, impact.hitBone, rig);
        const kinematicsCtx = { config, rig, displayDiameter: capture.kinematics.displayDiameter };
        const corpse = new RagdollCorpse(actor, capture.bindFrame, ragdoll, kinematicsCtx);
        state.ragdollCorpses.push(corpse);
        return corpse;
    }
    constructor(actor, bindFrame, ragdoll, kinematicsCtx) {
        super(actor.x, actor.y, bindFrame.bodyRotation, false);
        this.actor = actor;
        this.radius = actor.radius;
        this.ragdoll = ragdoll;
        this.bindFrame = bindFrame;
        this.kinematicsCtx = kinematicsCtx;
        this.ageMs = 0;
        this.opacity = 1;
        this.isDead = false;
    }
    update(dt, state, _spatialFrame, viewCenter, wallChecker) {
        this.ageMs += dt;
        if (this.ageMs >= CORPSE_MAX_MS) {
            this.isDead = true;
            return;
        }
        const { rig } = this.kinematicsCtx;
        const dtSec = dt / 1000;
        const { shiftX, shiftY } = updateRagdoll(this.ragdoll, dtSec, this.x, this.y, this.ragdoll.rotation, wallChecker, viewCenter?.x ?? this.x, viewCenter?.y ?? this.y, rig);
        if (shiftX || shiftY) {
            this.x += shiftX;
            this.y += shiftY;
        }
        updateBloodEffects(this.ragdoll, dtSec, rig);
        if (this.ragdoll.settled) {
            const fadeStart = CORPSE_MAX_MS - CORPSE_FADE_MS;
            if (this.ageMs > fadeStart) this.opacity = Math.max(0, 1 - (this.ageMs - fadeStart) / CORPSE_FADE_MS);
        }
        if (this.opacity <= 0.02) this.isDead = true;
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
