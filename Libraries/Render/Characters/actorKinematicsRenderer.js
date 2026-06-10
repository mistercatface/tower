import { LIBRARY_KINEMATICS_PIXEL_SIZE as kinematicsPixelSize } from "../../../Libraries/Motion/bodyDefaults.js";
import { blitCenteredSprite } from "../../Canvas/QuantizedSpriteCache.js";
import { CAMERA_HEIGHT } from "../../Spatial/iso/IsometricProjection.js";
import { createKinematicsBundle } from "../../Kinematics/createKinematicsBundle.js";
import { engine } from "../../../Apps/Editor/engine.js";
export class ActorKinematicsRenderer {
    constructor(radius) {
        const displayDiameter = radius * 4;
        this.bundle = createKinematicsBundle({ pixelSize: kinematicsPixelSize, cameraHeight: CAMERA_HEIGHT, maxTiltDist: radius * 15, displayDiameter, ports: engine.render.kinematicsPorts });
        this.displayDiameter = displayDiameter;
    }
    advance(actor, dt, camera) {
        this.bundle.advanceAnimation(actor, dt, camera);
    }
    getSprite(actor, camera) {
        return this.bundle.buildSprite(actor, camera);
    }
    getCacheKey(actor) {
        return `kinematics_actor_${actor.id}_${actor.radius}`;
    }
}
const renderersByRadius = new Map();
export function getKinematicsRenderer(radius) {
    let renderer = renderersByRadius.get(radius);
    if (!renderer) {
        renderer = new ActorKinematicsRenderer(radius);
        renderersByRadius.set(radius, renderer);
    }
    return renderer;
}
export function advanceActorKinematics(actor, dt, camera, radius = actor.radius) {
    getKinematicsRenderer(radius).advance(actor, dt, camera);
}
export function clearActorKinematics(actor, radius = actor.radius) {
    getKinematicsRenderer(radius).bundle.clearActorState(actor.id);
}
export function resolveKinematicsCamera(actor, state) {
    if (typeof actor.getKinematicsCamera === "function") return actor.getKinematicsCamera(state);
    if (state) return state.viewport;
    return actor;
}
export function captureActorRigForRagdoll(actor, camera, radius = actor.radius) {
    const kinematics = getKinematicsRenderer(radius);
    return { ...kinematics.bundle.captureActorRigForRagdoll(actor, camera), kinematics };
}
export function resolveKinematicsMuzzlePosition(actor, turretIndex, camera) {
    const kinematics = getKinematicsRenderer(actor.radius);
    return kinematics.bundle.resolveMuzzleWorldPosition(actor, camera, turretIndex, kinematics.displayDiameter);
}
export function resolveActorKinematicsCamera(actor) {
    return actor._kinematicsCamera ?? { x: actor.x, y: actor.y };
}
export function renderKinematicsBody(ctx, spec) {
    const kinematics = getKinematicsRenderer(spec.radius);
    const camera = spec.camera ?? resolveKinematicsCamera(spec.actor, spec.state);
    const sprite = spec.rigData ? kinematics.bundle.renderKinematicsFrame({ ...spec, camera }) : kinematics.getSprite(spec.actor, camera);
    blitCenteredSprite(ctx, sprite, spec.x, spec.y, kinematics.displayDiameter);
}
export function renderActorKinematicsBody(ctx, actor, camera, radius = actor.radius) {
    renderKinematicsBody(ctx, { x: actor.x, y: actor.y, radius, actor, camera });
}
export function renderCorpseKinematicsBody(ctx, corpse, state) {
    const kinematics = getKinematicsRenderer(corpse.radius);
    const camera = resolveKinematicsCamera(corpse, state);
    const frame = kinematics.bundle.resolveCorpseFrame(corpse, camera);
    renderKinematicsBody(ctx, { ...frame, radius: corpse.radius });
}
