import { CAMERA_HEIGHT } from "../3D/math/CombatProjection.js";
import { createKinematicsBundle } from "./createKinematicsBundle.js";

/** World radius → kinematics pixel size (tuned to match cw803 proportions). */
export function kinematicsPixelSizeForRadius(radius) {
    return Math.max(24, Math.round(radius * 4.25));
}

export class PlayerKinematicsRenderer {
    constructor(radius) {
        this.bundle = createKinematicsBundle({
            pixelSize: kinematicsPixelSizeForRadius(radius),
            cameraHeight: CAMERA_HEIGHT,
            maxTiltDist: radius * 15,
        });
        this.displayDiameter = radius * 4;
    }

    advance(actor, dt, camera) {
        this.bundle.advanceAnimation(actor, dt, camera);
    }

    getSprite(actor, camera) {
        return this.bundle.buildSprite(actor, camera);
    }

    getCacheKey(actor) {
        return `kinematics_player_${actor.id}_${actor.radius}`;
    }
}

const renderersByPixelSize = new Map();

export function getKinematicsRenderer(radius) {
    const pixelSize = kinematicsPixelSizeForRadius(radius);
    let renderer = renderersByPixelSize.get(pixelSize);
    if (!renderer) {
        renderer = new PlayerKinematicsRenderer(radius);
        renderersByPixelSize.set(pixelSize, renderer);
    }
    return renderer;
}

export function advanceActorKinematics(actor, dt, camera, radius = actor.radius) {
    getKinematicsRenderer(radius).advance(actor, dt, camera);
}

export function clearActorKinematics(actor, radius = actor.radius) {
    getKinematicsRenderer(radius).bundle.clearActorState(actor.id);
}

export function getCorpseKinematics(corpse) {
    return getKinematicsRenderer(corpse.radius);
}

/** Camera for kinematics tilt — same rules as updateCombat / body render. */
export function resolveKinematicsCamera(actor, state) {
    if (actor && typeof actor.getKinematicsCamera === "function") {
        return actor.getKinematicsCamera(state);
    }
    const player = state?.player;
    return player ? { x: player.x, y: player.y } : { x: actor?.x ?? 0, y: actor?.y ?? 0 };
}

export function captureActorRigForRagdoll(actor, camera, radius = actor.radius) {
    const kinematics = getKinematicsRenderer(radius);
    return {
        ...kinematics.bundle.captureActorRigForRagdoll(actor, camera),
        kinematics,
    };
}

export function resolveKinematicsMuzzlePosition(actor, turretIndex, camera) {
    const kinematics = getKinematicsRenderer(actor.radius);
    return kinematics.bundle.resolveMuzzleWorldPosition(
        actor,
        camera,
        turretIndex,
        kinematics.displayDiameter,
    );
}

/** Camera reference used for kinematics tilt/perspective — must match body render. */
export function resolveActorKinematicsCamera(actor) {
    return actor._kinematicsCamera ?? { x: actor.x, y: actor.y };
}

export function blitKinematicsCanvas(ctx, sprite, x, y, displayDiameter, opacity = 1) {
    const drawRatio = sprite.drawRatio ?? 1;
    const drawW = displayDiameter * drawRatio;
    const drawH = drawW * (sprite.height / sprite.width);
    const vShift = (sprite.verticalShift ?? 0) * (drawW / sprite.width);

    ctx.save();
    if (opacity < 1) ctx.globalAlpha = Math.max(0, opacity);
    ctx.translate(x, y);
    ctx.drawImage(sprite, -drawW / 2, -drawH / 2 - vShift, drawW, drawH);
    ctx.restore();
}

/** Live: cached sprite. Corpse: pass rigData for direct render. Same blit either way. */
export function renderKinematicsBody(ctx, spec) {
    const kinematics = getKinematicsRenderer(spec.radius);
    const camera = spec.camera ?? resolveKinematicsCamera(spec.actor, spec.state);

    const sprite = spec.rigData
        ? kinematics.bundle.renderKinematicsFrame({ ...spec, camera })
        : kinematics.getSprite(spec.actor, camera);

    blitKinematicsCanvas(ctx, sprite, spec.x, spec.y, kinematics.displayDiameter, spec.opacity ?? 1);
}

export function renderActorKinematicsBody(ctx, actor, camera, radius = actor.radius) {
    renderKinematicsBody(ctx, { x: actor.x, y: actor.y, radius, actor, camera });
}

export function renderCorpseKinematicsBody(ctx, corpse, state) {
    const kinematics = getCorpseKinematics(corpse);
    const player = state?.player;
    const camera = player ? { x: player.x, y: player.y } : resolveKinematicsCamera(corpse.actor, state);
    const frame = kinematics.bundle.resolveCorpseFrame(corpse, camera);
    renderKinematicsBody(ctx, { ...frame, radius: corpse.radius, opacity: corpse.opacity });
}
