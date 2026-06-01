import { CAMERA_HEIGHT } from "../3D/math/CombatProjection.js";
import { normalizeWeaponLoadout } from "../../Combat/equipmentLoadout.js";
import { createKinematicsConfig, createKinematicsRig } from "./KinematicsConfig.js";
import { createKinematicsPoses } from "./KinematicsPoses.js";
import { createSceneRenderer } from "./KinematicsSceneRenderer.js";
import { createKinematicsSpriteCache } from "./KinematicsSpriteCache.js";
import { calculateCharacterRig } from "./KinematicsRigCalculator.js";
import { createProjector } from "./KinematicsProjector.js";
import { drawKinematicsFrameToCanvas } from "./KinematicsDraw.js";
import { resolveCombatFacing, resolveSpriteBodyRotation } from "./KinematicsFacing.js";
import { resolveWeaponStaticPoseName } from "./KinematicsWeaponVisuals.js";
import { resolveMuzzleFromRig } from "./KinematicsMuzzle.js";

const sharedCanvas = document.createElement("canvas");
const sharedCtx = sharedCanvas.getContext("2d", { alpha: true });

const MIN_Y_FACTOR = 0.1;
const MAX_Y_FACTOR = 0.8;

/** World radius → kinematics pixel size (tuned to match cw803 proportions). */
export function kinematicsPixelSizeForRadius(radius) {
    return Math.max(24, Math.round(radius * 4.25));
}

/** Perspective reference for foreshortening — player/leader for followers, self for player. */
export function resolvePerspectiveCamera(actor, state) {
    if (actor && typeof actor.getKinematicsCamera === "function") {
        return actor.getKinematicsCamera(state);
    }
    return { x: actor?.x ?? 0, y: actor?.y ?? 0 };
}

function createEntityAnimState(poses) {
    return {
        pose: "IDLE",
        currentStaticPose: poses.IDLE,
        lastStaticPose: poses.IDLE,
        staticBlendFactor: 1,
        animCycle: 0,
        lastX: 0,
        lastY: 0,
        smoothedSpeed: 0,
        poseFactor: 0,
        legPoseFactor: 0,
        crouchFactor: 0,
        weaponLoadoutKey: "",
        lastStaticChange: 0,
    };
}

function getWeaponLoadoutKey(actor) {
    return normalizeWeaponLoadout(actor.weaponLoadout ?? []).join("+") || "none";
}

function syncWeaponPose(state, actor, poses) {
    const weaponKey = getWeaponLoadoutKey(actor);
    if (weaponKey === state.weaponLoadoutKey) return;
    state.weaponLoadoutKey = weaponKey;
    const poseName = resolveWeaponStaticPoseName(actor);
    const nextPose = poses[poseName] ?? poses.IDLE;
    state.lastStaticPose = state.currentStaticPose;
    state.currentStaticPose = nextPose;
    state.staticBlendFactor = 0;
    state.lastStaticChange = 0;
}

function cloneRigPoint(p) {
    if (!p) return p;
    return { x: p.x, y: p.y, z: p.z ?? 0 };
}

function cloneRigData(rigData) {
    const limb = (l) => ({
        p1: cloneRigPoint(l.p1),
        p2: cloneRigPoint(l.p2),
        p3: cloneRigPoint(l.p3),
    });
    return {
        head: cloneRigPoint(rigData.head),
        spineTop: cloneRigPoint(rigData.spineTop),
        spineBot: cloneRigPoint(rigData.spineBot),
        rArm: limb(rigData.rArm),
        lArm: limb(rigData.lArm),
        rLeg: limb(rigData.rLeg),
        lLeg: limb(rigData.lLeg),
    };
}

function createRendererBundle({ pixelSize, cameraHeight, maxTiltDist = 120 }) {
    const config = createKinematicsConfig(pixelSize);
    const rig = createKinematicsRig(config);
    const poses = createKinematicsPoses(config, rig);
    const sceneRenderer = createSceneRenderer(config);
    const spriteCache = createKinematicsSpriteCache();
    const entityStates = new Map();

    const perspectiveHeight = 1.0;
    const globalRatio = perspectiveHeight / Math.max(0.1, cameraHeight - perspectiveHeight);

    function getOrCreateState(actor) {
        if (!entityStates.has(actor.id)) {
            const state = createEntityAnimState(poses);
            state.lastX = actor.x;
            state.lastY = actor.y;
            entityStates.set(actor.id, state);
        }
        return entityStates.get(actor.id);
    }

    function buildViewContextAt(x, y, camera) {
        const dx = x - camera.x;
        const dy = y - camera.y;
        const horizontalDist = Math.hypot(dx, dy);
        const rawTiltFactor = Math.min(1.0, horizontalDist / maxTiltDist);
        return { rawTiltFactor };
    }

    function buildViewContext(x, y, camera, bodyRotation, animCycle) {
        const { rawTiltFactor } = buildViewContextAt(x, y, camera);
        const q = spriteCache.quantize(bodyRotation, animCycle, rawTiltFactor);
        return {
            yFactor: MIN_Y_FACTOR + (MAX_Y_FACTOR - MIN_Y_FACTOR) * q.tilt,
            shiftX: 0,
            shiftY: 0,
            ratio: globalRatio,
        };
    }

    function advanceAnimation(actor, dt, _camera) {
        const state = getOrCreateState(actor);
        const dtSec = dt / 1000;

        const moveDx = actor.x - state.lastX;
        const moveDy = actor.y - state.lastY;
        const dist = Math.hypot(moveDx, moveDy);
        const safeDelta = Math.max(dtSec, 0.001);
        let measuredSpeed = dist / safeDelta;
        if (dist > 80) measuredSpeed = 0;

        state.smoothedSpeed = measuredSpeed < state.smoothedSpeed ? state.smoothedSpeed * 0.2 + measuredSpeed * 0.8 : state.smoothedSpeed * 0.5 + measuredSpeed * 0.5;

        const speed = Math.max(0, state.smoothedSpeed);
        const refSpeed = Math.max(1, actor.baseMoveSpeed ?? actor.speed ?? 50);
        const walkPlayback = Math.min(1.15, speed / refSpeed);
        state.lastX = actor.x;
        state.lastY = actor.y;

        const hasMoveIntent = actor.isMoving || Math.hypot(actor.desiredX ?? 0, actor.desiredY ?? 0) > 0.05 || Math.hypot(actor.vx ?? 0, actor.vy ?? 0) > 2;
        syncWeaponPose(state, actor, poses);

        const hasWeapons = getWeaponLoadoutKey(actor) !== "none";
        const isWalking = walkPlayback > 0.12 || hasMoveIntent;
        const targetPoseFactor = isWalking ? 1 : 0;
        const locomotionBlend = hasWeapons ? state.legPoseFactor : state.poseFactor;
        const transitionSpeed = locomotionBlend > 0.5 ? 3 : 1.5;

        if (hasWeapons) {
            state.poseFactor = 0;
            state.legPoseFactor += (targetPoseFactor - state.legPoseFactor) * dtSec * transitionSpeed;
            state.legPoseFactor = Math.max(0, Math.min(1, state.legPoseFactor));

            const weaponPose = poses[resolveWeaponStaticPoseName(actor)] ?? poses.IDLE;
            state.currentStaticPose = weaponPose;
            state.lastStaticPose = weaponPose;
            state.staticBlendFactor = 1;
            state.pose = weaponPose.name;
        } else {
            state.legPoseFactor = 0;
            state.poseFactor += (targetPoseFactor - state.poseFactor) * dtSec * transitionSpeed;
            state.poseFactor = Math.max(0, Math.min(1, state.poseFactor));

            if (!isWalking) {
                const idlePose = poses.IDLE;
                if (state.currentStaticPose !== idlePose) {
                    state.lastStaticPose = state.currentStaticPose;
                    state.currentStaticPose = idlePose;
                    state.staticBlendFactor = 0;
                } else {
                    state.staticBlendFactor = Math.min(1, state.staticBlendFactor + dtSec / 0.75);
                }
                state.pose = idlePose.name;
            } else {
                state.staticBlendFactor = 1;
                state.currentStaticPose = poses.IDLE;
                state.lastStaticPose = poses.IDLE;
                state.pose = "WALK";
            }
        }

        const locomoting = hasWeapons ? state.legPoseFactor > 0.1 : state.poseFactor > 0.1;
        const cycleSpeed = locomoting ? config.STRIDE_SPEED : config.IDLE_SPEED;
        const playbackSpeed = locomoting ? walkPlayback * (config.WALK_PLAYBACK_SCALE ?? 1) : 1;
        state.animCycle += playbackSpeed * dtSec * cycleSpeed;

        return state;
    }

    /** Live frame from animation, or corpse frame from bindFrame. */
    function resolveFrame(actor, camera, options = {}) {
        const { freezePose = false, bindFrame = null } = options;

        if (bindFrame) {
            return {
                x: actor.x,
                y: actor.y,
                camera,
                rigData: bindFrame.rigData,
                bodyRotation: bindFrame.bodyRotation,
                animCycle: bindFrame.animCycle,
                actor,
                facing: bindFrame.facing,
                drawOptions: { drawWeapons: false },
                padding: spriteCache.cachePadding,
            };
        }

        const state = getOrCreateState(actor);
        syncWeaponPose(state, actor, poses);
        const bodyRotation = resolveSpriteBodyRotation(actor);
        const animCycle = state.animCycle % (Math.PI * 2);
        const { rawTiltFactor } = buildViewContextAt(actor.x, actor.y, camera);
        const q = spriteCache.quantize(bodyRotation, animCycle, rawTiltFactor);
        const facing = resolveCombatFacing(actor, state, q.rotation, config);
        const rigData = calculateCharacterRig(
            { ...state, staticBlendFactor: freezePose ? 1 : state.staticBlendFactor },
            q.cycle,
            config,
            rig,
            poses,
            actor,
            facing,
        );

        return {
            x: actor.x,
            y: actor.y,
            camera,
            rigData,
            bodyRotation,
            animCycle,
            actor,
            facing,
            drawOptions: { drawWeapons: true },
            padding: spriteCache.cachePadding,
            cacheMeta: freezePose
                ? null
                : {
                      state,
                      q,
                      rawTiltFactor,
                      weaponKey: getWeaponLoadoutKey(actor),
                      aimKey: spriteCache.quantizeAimKey(actor),
                  },
        };
    }

    function renderFrame(frame) {
        const {
            x,
            y,
            camera,
            rigData,
            bodyRotation = 0,
            animCycle = 0,
            actor,
            facing,
            drawOptions = {},
            padding = spriteCache.cachePadding,
        } = frame;
        const viewContext = buildViewContext(x, y, camera, bodyRotation, animCycle);
        return drawKinematicsFrameToCanvas(
            sharedCanvas,
            sharedCtx,
            rigData,
            actor,
            viewContext,
            facing,
            config,
            rig,
            sceneRenderer,
            padding,
            drawOptions,
        );
    }

    function buildSprite(actor, camera) {
        const frame = resolveFrame(actor, camera);
        const { state, q, rawTiltFactor, weaponKey, aimKey } = frame.cacheMeta;
        const cacheKey = spriteCache.getKey(actor.id, state.pose, q, state.crouchFactor, weaponKey, aimKey);

        const cached = spriteCache.get(cacheKey);
        if (cached) return cached;

        return spriteCache.set(cacheKey, renderFrame(frame));
    }

    function captureCorpseBindFrame(actor, camera) {
        const frame = resolveFrame(actor, camera, { freezePose: true });
        return {
            bindFrame: {
                rigData: cloneRigData(frame.rigData),
                bodyRotation: frame.bodyRotation,
                animCycle: frame.animCycle,
                facing: frame.facing,
            },
        };
    }

    function resolveCorpseFrame(corpse, camera) {
        return resolveFrame(corpse.actor, camera, { bindFrame: corpse.bindFrame });
    }

    function resolveMuzzleWorldPosition(actor, camera, turretIndex, displayDiameter) {
        const frame = resolveFrame(actor, camera);
        const viewContext = buildViewContext(frame.x, frame.y, frame.camera, frame.bodyRotation, frame.animCycle);
        const project = createProjector(viewContext, frame.facing.renderRotation, config, rig);
        return resolveMuzzleFromRig(
            actor,
            frame.rigData,
            project,
            config,
            frame.facing,
            turretIndex,
            displayDiameter,
            frame.padding,
        );
    }

    return {
        config,
        rig,
        advanceAnimation,
        buildSprite,
        renderFrame,
        resolveFrame,
        resolveCorpseFrame,
        captureCorpseBindFrame,
        clearActorState: (actorId) => entityStates.delete(actorId),
        clearAllStates: () => entityStates.clear(),
        resolveMuzzleWorldPosition,
    };
}

class KinematicsRenderer {
    constructor(radius) {
        this.bundle = createRendererBundle({
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
}

const renderersByPixelSize = new Map();

export function getKinematicsRenderer(radius) {
    const pixelSize = kinematicsPixelSizeForRadius(radius);
    let renderer = renderersByPixelSize.get(pixelSize);
    if (!renderer) {
        renderer = new KinematicsRenderer(radius);
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

export function captureCorpseBindFrame(actor, camera, radius = actor.radius) {
    return getKinematicsRenderer(radius).bundle.captureCorpseBindFrame(actor, camera);
}

export function resolveKinematicsMuzzlePosition(actor, turretIndex, camera, radius = actor.radius) {
    const kinematics = getKinematicsRenderer(radius);
    return kinematics.bundle.resolveMuzzleWorldPosition(
        actor,
        camera,
        turretIndex,
        kinematics.displayDiameter,
    );
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

export function renderKinematicsBody(ctx, spec) {
    const kinematics = getKinematicsRenderer(spec.radius);
    const camera = spec.camera ?? resolvePerspectiveCamera(spec.actor, spec.state);

    const sprite = spec.rigData
        ? kinematics.bundle.renderFrame({ ...spec, camera })
        : kinematics.getSprite(spec.actor, camera);

    blitKinematicsCanvas(ctx, sprite, spec.x, spec.y, kinematics.displayDiameter, spec.opacity ?? 1);
}

export function renderActorKinematicsBody(ctx, actor, state) {
    const camera = actor._perspectiveCamera ?? resolvePerspectiveCamera(actor, state);
    renderKinematicsBody(ctx, { x: actor.x, y: actor.y, radius: actor.radius, actor, camera, state });
}

export function renderCorpseKinematicsBody(ctx, corpse, state) {
    const kinematics = getKinematicsRenderer(corpse.radius);
    const camera = resolvePerspectiveCamera(corpse.actor, state);
    const frame = kinematics.bundle.resolveCorpseFrame(corpse, camera);
    renderKinematicsBody(ctx, { ...frame, radius: corpse.radius, opacity: corpse.opacity, state });
}
