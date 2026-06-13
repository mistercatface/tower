import { LIBRARY_KINEMATICS_PIXEL_SIZE as kinematicsPixelSize } from "../../../Libraries/Motion/bodyDefaults.js";
import { blitCenteredSprite } from "../../Canvas/QuantizedSpriteCache.js";
import { resolveSpriteDrawModifier } from "../spriteDrawModifier.js";
import { CAMERA_HEIGHT } from "../../Spatial/iso/IsometricProjection.js";
import { GUN_ID_TO_VISUAL } from "../../../Assets/guns/visualMap.js";
import { createDefaultKinematicsPorts } from "../../Kinematics/kinematicsPorts.js";
import { createKinematicsBundle } from "../../Kinematics/createKinematicsBundle.js";
import { createWeaponVisuals } from "./weapons/createWeaponVisuals.js";
export class ActorKinematicsRenderer {
    constructor(radius) {
        const displayDiameter = radius * 4;
        const kinematicsPorts = createDefaultKinematicsPorts({ weaponVisuals: createWeaponVisuals(GUN_ID_TO_VISUAL) });
        this.bundle = createKinematicsBundle({ pixelSize: kinematicsPixelSize, cameraHeight: CAMERA_HEIGHT, maxTiltDist: radius * 15, displayDiameter, ports: kinematicsPorts });
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
/** @param {object} state @param {number} dt @param {object} spatialFrame */
export function tickVisibleKinematicsAnim(state, dt, spatialFrame) {
    const viewport = state.viewport;
    const props = state.entityRegistry.queryView(
        { bounds: viewport.boundsVisibleDefault, kinds: ["worldProp"], filterId: "kinematicsAnim", match: (p) => p.usesKinematicsBody && !p.isDead },
        spatialFrame,
    );
    for (let i = 0; i < props.length; i++) advanceActorKinematics(props[i], dt, viewport);
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
    const modifier = spec.actor ? resolveSpriteDrawModifier(spec.actor, camera) : null;
    blitCenteredSprite(ctx, sprite, spec.x, spec.y, kinematics.displayDiameter, modifier);
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
