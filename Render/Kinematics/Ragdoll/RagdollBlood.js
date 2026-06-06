import { clamp } from "../../../Libraries/Math/Interpolate.js";
import { RAGDOLL_CONFIG } from "./RagdollConfig.js";
import { absRagdollPoint } from "./RagdollPhysics.js";
import { PHYSICS_BONES, resolvePhysicsBoneId } from "../KinematicsBones.js";

function createBloodParticle(point, bCfg, scale = 1) {
    const life = bCfg.LIFESPAN_MIN + Math.random() * (bCfg.LIFESPAN_MAX - bCfg.LIFESPAN_MIN);
    return {
        x: point.x + (Math.random() - 0.5) * 0.08 * scale,
        y: point.y + (Math.random() - 0.5) * 0.08 * scale,
        z: point.z + (Math.random() - 0.5) * 0.08 * scale,
        vx: (Math.random() - 0.5) * 3 * scale,
        vy: (-2 - Math.random() * 4) * scale,
        vz: (Math.random() - 0.5) * 3 * scale,
        life,
        startLife: life,
        size: 0.5 + Math.random() * 0.5,
        color: Math.random() > 0.4 ? bCfg.PALETTE.ARTERIAL : bCfg.PALETTE.VENOUS,
        onGround: false,
    };
}

export function seedRagdollBloodOnDeath(ragdoll, hitBone, rig) {
    if (!ragdoll?.points) return;
    const bCfg = RAGDOLL_CONFIG.BLOOD;
    const scale = rig.size / 32;
    const anchor = resolvePhysicsBoneId(hitBone, ragdoll.points) ?? "spineTop";

    const bleedBones = [anchor, ...PHYSICS_BONES.filter((id) => id !== anchor)];
    for (const bone of bleedBones) {
        if (!ragdoll.points[bone]) continue;
        ragdoll.emitters.push({ bone, dir: { x: (Math.random() - 0.5) * 0.5, y: -1, z: (Math.random() - 0.5) * 0.5 }, life: bCfg.SPRAY_LIFE * (1.2 + Math.random() * 0.6), scale });
    }

    const burstBones = [anchor, "spineTop", "head"];
    for (const bone of burstBones) {
        const burstPoint = absRagdollPoint(ragdoll, bone);
        if (!burstPoint) continue;
        for (let i = 0; i < bCfg.BURST_COUNT; i++) {
            ragdoll.particles.push(createBloodParticle(burstPoint, bCfg, scale));
        }
    }
}

export function addRagdollBleedEmitter(ragdoll, boneId, rig, durationScale = 1) {
    const resolved = resolvePhysicsBoneId(boneId, ragdoll?.points);
    if (!resolved) return;
    boneId = resolved;
    if (!ragdoll?.points?.[boneId]) return;
    const bCfg = RAGDOLL_CONFIG.BLOOD;
    ragdoll.emitters.push({ bone: boneId, dir: { x: (Math.random() - 0.5) * 0.8, y: -1, z: (Math.random() - 0.5) * 0.8 }, life: bCfg.SPRAY_LIFE * 0.9 * durationScale, scale: rig.size / 32 });
}

export function updateBloodEffects(ragdoll, deltaSec, rig) {
    if (!ragdoll) return;
    const { particles, emitters, points, prevPoints, groundY } = ragdoll;
    const dt = clamp(deltaSec, 0, 0.033);
    const bCfg = RAGDOLL_CONFIG.BLOOD;
    const scale = rig.size / 32;
    if (!ragdoll.floorStains) ragdoll.floorStains = [];
    if (particles.length > bCfg.MAX_PARTICLES) particles.splice(0, particles.length - bCfg.MAX_PARTICLES);
    while (ragdoll.floorStains.length > bCfg.MAX_STAINS) {
        ragdoll.floorStains.shift();
    }
    for (let i = emitters.length - 1; i >= 0; i--) {
        const e = emitters[i];
        e.life -= dt;
        if (e.life <= 0) {
            emitters.splice(i, 1);
            continue;
        }
        const bone = points[e.bone];
        if (!bone) continue;
        const merged = absRagdollPoint(ragdoll, e.bone);
        if (!merged) continue;
        const flowStrength = clamp(e.life / bCfg.SPRAY_LIFE, 0, 1);
        const prev = prevPoints[e.bone];
        const moveX = prev ? (bone.x - prev.x) * 0.15 : 0;
        const emitterScale = e.scale || scale;
        const speed = 1.2 * flowStrength * emitterScale;
        if (Math.random() > 0.25) continue;
        const dropLife = bCfg.LIFESPAN_MIN + Math.random() * (bCfg.LIFESPAN_MAX - bCfg.LIFESPAN_MIN);
        particles.push({
            x: merged.x + (Math.random() - 0.5) * 0.06 * emitterScale,
            y: merged.y + (Math.random() - 0.5) * 0.04 * emitterScale,
            z: merged.z + (Math.random() - 0.5) * 0.06 * emitterScale,
            vx: e.dir.x * speed + moveX,
            vy: e.dir.y * speed,
            vz: e.dir.z * speed,
            life: dropLife,
            startLife: dropLife,
            size: 0.45 + Math.random() * 0.35,
            color: bCfg.PALETTE.ARTERIAL,
            onGround: false,
        });
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (p.onGround) {
            p.life -= dt * (bCfg.GROUND_FADE ?? 0.1);
        } else {
            p.life -= dt;
            p.vy += bCfg.GRAVITY * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            p.vx *= bCfg.DRAG;
            p.vy *= bCfg.DRAG;
            p.vz *= bCfg.DRAG;

            if (p.y >= groundY) {
                p.y = groundY;
                p.vx *= 0.75;
                p.vz *= 0.75;
                p.vy = 0;
                p.onGround = true;
                if (Math.random() < 0.65) {
                    ragdoll.floorStains.push({ x: p.x, y: groundY, z: p.z, size: p.size * (2 + Math.random() * 1.5), color: bCfg.PALETTE.DRIED });
                }
                p.size = (0.25 + 0.75 * (p.life / p.startLife)) * bCfg.SPLAT_SIZE;
            } else {
                p.size = 0.25 + 0.75 * (p.life / p.startLife);
            }
        }
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawPixelStain(ctx, px, py, radius, color) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.88;
    const rInt = Math.ceil(radius);
    const cx = Math.round(px);
    const cy = Math.round(py);
    for (let y = -rInt; y <= rInt; y++) {
        for (let x = -rInt; x <= rInt; x++) {
            if (x * x + y * 2 * (y * 2) <= radius * radius && Math.random() > 0.25) {
                ctx.fillRect(cx + x, cy + y, 1, 1);
            }
        }
    }
    ctx.globalAlpha = 1;
}

function drawBloodDrop(ctx, proj, particle, config, bCfg) {
    const pixelRadius = config.SIZE * bCfg.DROP_SIZE * (proj.scale ?? 1) * particle.size;
    ctx.fillStyle = particle.color;
    if (pixelRadius < 0.8) {
        ctx.fillRect(Math.round(proj.x), Math.round(proj.y), 1, 1);
        return;
    }
    if (particle.onGround) {
        ctx.globalAlpha = 0.85 * clamp(particle.life / particle.startLife, 0, 1);
        const w = Math.max(2, Math.ceil(pixelRadius * 2));
        ctx.fillRect(Math.round(proj.x - w / 2), Math.round(proj.y), w, 1);
        ctx.globalAlpha = 1;
        return;
    }
    const r = Math.max(1, pixelRadius);
    const cx = Math.round(proj.x);
    const cy = Math.round(proj.y);
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
        for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
            if (x * x + y * y <= r * r) {
                ctx.fillRect(cx + x, cy + y, 1, 1);
            }
        }
    }
}

/** Queue floor stains and blood drops on the scene renderer (canvas-local space). */
export function queueRagdollBloodDraw(sceneRenderer, ragdoll, config, rig, viewContext, renderRotation) {
    if (!ragdoll || !sceneRenderer) return;
    const bCfg = RAGDOLL_CONFIG.BLOOD;
    const project = sceneRenderer.project;

    if (ragdoll.floorStains?.length) {
        for (const stain of ragdoll.floorStains) {
            const projected = project({ x: stain.x, y: stain.y, z: stain.z });
            const radius = config.SIZE * 0.02 * (projected.scale ?? 1) * stain.size;
            sceneRenderer.addCustom(-0.08, (ctx) => {
                drawPixelStain(ctx, projected.x, projected.y, radius, stain.color);
            });
        }
    }

    if (ragdoll.particles?.length) {
        for (const particle of ragdoll.particles) {
            const projected = project({ x: particle.x, y: particle.y, z: particle.z });
            sceneRenderer.addCustom(0.02, (ctx) => {
                drawBloodDrop(ctx, projected, particle, config, bCfg);
            });
        }
    }
}
