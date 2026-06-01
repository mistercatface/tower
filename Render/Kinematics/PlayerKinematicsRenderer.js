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

/** @deprecated Use getKinematicsRenderer */
export const getPlayerKinematicsRenderer = getKinematicsRenderer;

export function advanceActorKinematics(actor, dt, camera, radius = actor.radius) {
    getKinematicsRenderer(radius).advance(actor, dt, camera);
}

export function clearActorKinematics(actor, radius = actor.radius) {
    getKinematicsRenderer(radius).bundle.clearActorState(actor.id);
}

export function buildCorpseKinematicsViewContext(x, y, camera, radius) {
    return getKinematicsRenderer(radius).bundle.buildRagdollViewContext(x, y, camera);
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

export function renderActorKinematicsBody(ctx, actor, camera, radius = actor.radius) {
    const kinematics = getKinematicsRenderer(radius);
    const sprite = kinematics.getSprite(actor, camera);
    const drawRatio = sprite.drawRatio ?? 1;
    const drawW = kinematics.displayDiameter * drawRatio;
    const drawH = drawW * (sprite.height / sprite.width);
    const vShift = (sprite.verticalShift ?? 0) * (drawW / sprite.width);

    ctx.save();
    ctx.translate(actor.x, actor.y);
    ctx.drawImage(sprite, -drawW / 2, -drawH / 2 - vShift, drawW, drawH);
    ctx.restore();
}
