import { Entity } from "./Entity.js";
import { applyRagdollImpulse, getRagdollRig, updateRagdoll } from "../Render/Kinematics/Ragdoll/RagdollPhysics.js";
import { checkRagdollHit, ragdollPartToWorld } from "../Render/Kinematics/Ragdoll/RagdollHitTest.js";
import { projectRagdollRig } from "../Render/Kinematics/KinematicsProjector.js";
import { drawCharacterToCanvas } from "../Render/Kinematics/KinematicsDraw.js";
import { createObstacleWallChecker, createRagdollState, resolveDeathImpact } from "../Render/Kinematics/Ragdoll/ragdollFromActor.js";
import { captureActorRigForRagdoll } from "../Render/Kinematics/PlayerKinematicsRenderer.js";
import { CombatParticles } from "../Render/CombatParticles.js";

const CORPSE_MAX_MS = 12000;
const CORPSE_FADE_MS = 2500;

export class RagdollCorpse extends Entity {
    static tryProjectileHit(state, projectile) {
        if (!state.ragdollCorpses?.length || projectile.isDead) return false;

        for (const corpse of state.ragdollCorpses) {
            if (corpse.isDead) continue;
            const hit = checkRagdollHit(corpse, projectile.x, projectile.y, projectile.radius);
            if (!hit) continue;

            const forceScale = Math.max(8, (projectile.speed ?? 100) * 0.035);
            const fx = Math.cos(projectile.angle) * forceScale;
            const fy = -forceScale * 0.25;
            const fz = Math.sin(projectile.angle) * forceScale;

            applyRagdollImpulse(
                corpse.ragdoll,
                fx,
                fy,
                fz,
                hit.part,
                corpse.snapshot.rig,
                corpse.ragdoll.rotation,
                corpse.snapshot.config,
            );

            const { x: bx, y: by } = ragdollPartToWorld(corpse, hit.part);
            CombatParticles.spawnBlood(state, bx, by, {
                impactAngle: projectile.angle,
                count: 6,
                intensity: 1.1,
                sizeBase: Math.max(4, corpse.radius * 0.4),
            });

            if (projectile.penetration > 0) {
                projectile.penetration--;
            } else {
                projectile.isDead = true;
            }
            return true;
        }
        return false;
    }

    static updateAll(state, dt, spatialFrame) {
        if (!state.ragdollCorpses?.length) return;
        const player = state.player;
        const wallChecker = createObstacleWallChecker(state);
        for (let i = state.ragdollCorpses.length - 1; i >= 0; i--) {
            const corpse = state.ragdollCorpses[i];
            corpse.update(dt, state, spatialFrame, player, wallChecker);
            if (corpse.isDead) {
                state.ragdollCorpses.splice(i, 1);
            }
        }
    }

    static spawnFromActor(state, actor, event, camera) {
        if (!state) return null;
        if (!state.ragdollCorpses) state.ragdollCorpses = [];

        const snapshot = captureActorRigForRagdoll(actor, camera);
        const impact = resolveDeathImpact(actor, event);
        const ragdoll = createRagdollState(
            snapshot.rigData,
            snapshot.rotation,
            impact,
            snapshot.config,
            snapshot.rig,
        );

        const corpse = new RagdollCorpse(actor, snapshot, ragdoll);
        state.ragdollCorpses.push(corpse);
        CombatParticles.spawnDeathBlood(state, actor, event);
        return corpse;
    }

    constructor(actor, snapshot, ragdoll) {
        super(actor.x, actor.y, snapshot.rotation, false);
        this.actor = actor;
        this.radius = actor.radius;
        this.ragdoll = ragdoll;
        this.snapshot = snapshot;
        this.bundle = snapshot.kinematics.bundle;
        this.displayDiameter = snapshot.kinematics.displayDiameter;
        this.ageMs = 0;
        this.opacity = 1;
        this.isDead = false;
    }

    update(dt, state, _spatialFrame, player, wallChecker) {
        this.ageMs += dt;
        if (this.ageMs >= CORPSE_MAX_MS) {
            this.isDead = true;
            return;
        }

        const { rig, config } = this.snapshot;
        updateRagdoll(
            this.ragdoll,
            dt / 1000,
            this.x,
            this.y,
            this.ragdoll.rotation,
            wallChecker,
            player?.x ?? this.x,
            player?.y ?? this.y,
            rig,
        );

        if (this.ragdoll.settled) {
            const fadeStart = CORPSE_MAX_MS - CORPSE_FADE_MS;
            if (this.ageMs > fadeStart) {
                this.opacity = Math.max(0, 1 - (this.ageMs - fadeStart) / CORPSE_FADE_MS);
            }
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

        const { config, rig, renderRotation, viewContext } = this.snapshot;
        const rigData = getRagdollRig(this.ragdoll);
        const scene = projectRagdollRig(rigData, renderRotation, viewContext, config, rig);
        const facing = { renderRotation, gunCanvasAim: () => renderRotation };

        const sprite = drawCharacterToCanvas(
            this.bundle.sharedCanvas,
            this.bundle.sharedCtx,
            scene,
            this.actor,
            viewContext,
            facing,
            config,
            rig,
            this.bundle.sceneRenderer,
            null,
            { drawWeapons: false },
        );

        const drawRatio = sprite.drawRatio ?? 1;
        const drawW = this.displayDiameter * drawRatio;
        const drawH = drawW * (sprite.height / sprite.width);
        const vShift = (sprite.verticalShift ?? 0) * (drawW / sprite.width);

        ctx.save();
        ctx.globalAlpha = Math.max(0, this.opacity);
        ctx.translate(this.x, this.y);
        ctx.drawImage(sprite, -drawW / 2, -drawH / 2 - vShift, drawW, drawH);
        ctx.restore();
    }
}
