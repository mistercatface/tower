import { createKinematicsConfig, createKinematicsRig } from "./KinematicsConfig.js";
import { createKinematicsPoses } from "./KinematicsPoses.js";
import { createSceneRenderer } from "./KinematicsSceneRenderer.js";
import { createKinematicsSpriteCache } from "./KinematicsSpriteCache.js";
import { calculateCharacterRig } from "./KinematicsRigCalculator.js";
import { projectRig } from "./KinematicsProjector.js";
import { drawCharacterToCanvas } from "./KinematicsDraw.js";
import { blend, ease } from "./KinematicsMath.js";
import { normalizeWeaponLoadout } from "../../Combat/equipmentLoadout.js";
import { resolveWeaponStaticPoseName } from "./KinematicsWeaponVisuals.js";

const sharedCanvas = document.createElement("canvas");
const sharedCtx = sharedCanvas.getContext("2d", { alpha: true });

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

function getQuantizedAimKey(actor, rotationSteps = 32) {
    const step = (Math.PI * 2) / rotationSteps;
    const quantize = (angle) => {
        let r = (angle ?? 0) % (Math.PI * 2);
        if (r < 0) r += Math.PI * 2;
        return Math.floor(r / step);
    };
    const turrets = actor.turrets ?? [];
    return `${quantize(turrets[0]?.angle)}_${quantize(turrets[1]?.angle)}`;
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

export function createKinematicsBundle({ pixelSize, cameraHeight, maxTiltDist = 120 }) {
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

    function advanceAnimation(actor, dt, camera) {
        const state = getOrCreateState(actor);
        const dtSec = dt / 1000;

        const moveDx = actor.x - state.lastX;
        const moveDy = actor.y - state.lastY;
        const dist = Math.hypot(moveDx, moveDy);
        const safeDelta = Math.max(dtSec, 0.001);
        let measuredSpeed = dist / safeDelta;
        if (dist > 80) measuredSpeed = 0;

        state.smoothedSpeed = measuredSpeed < state.smoothedSpeed
            ? state.smoothedSpeed * 0.2 + measuredSpeed * 0.8
            : state.smoothedSpeed * 0.5 + measuredSpeed * 0.5;

        const speed = Math.max(0, state.smoothedSpeed);
        const refSpeed = Math.max(1, actor.baseMoveSpeed ?? actor.speed ?? 50);
        const walkPlayback = Math.min(1.15, speed / refSpeed);
        state.lastX = actor.x;
        state.lastY = actor.y;

        const hasMoveIntent =
            actor.isMoving
            || Math.hypot(actor.desiredX ?? 0, actor.desiredY ?? 0) > 0.05
            || Math.hypot(actor.vx ?? 0, actor.vy ?? 0) > 2;
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

    function buildViewContext(actor, camera) {
        const camX = camera.x;
        const camY = camera.y;
        const dx = actor.x - camX;
        const dy = actor.y - camY;
        const horizontalDist = Math.hypot(dx, dy);
        const rawTiltFactor = Math.min(1.0, horizontalDist / maxTiltDist);

        return {
            rawTiltFactor,
            viewContext: {
                yFactor: 0.8,
                shiftX: 0,
                shiftY: 0,
                ratio: globalRatio,
            },
        };
    }

    function buildSprite(actor, camera) {
        const state = getOrCreateState(actor);
        const rotation = actor.angle ?? 0;
        const naturalCycle = state.animCycle % (Math.PI * 2);
        const { rawTiltFactor, viewContext } = buildViewContext(actor, camera);

        const weaponKey = getWeaponLoadoutKey(actor);
        const aimKey = getQuantizedAimKey(actor, spriteCache.rotationSteps);
        const cacheKey = spriteCache.getKey(
            actor.id,
            state.pose,
            rotation,
            naturalCycle,
            state.crouchFactor,
            rawTiltFactor,
            weaponKey,
            aimKey,
        );

        const cached = spriteCache.get(cacheKey);
        if (cached) return cached;

        const q = spriteCache.getQuantizedValues(rotation, naturalCycle, rawTiltFactor);
        const minYFactor = 0.1;
        viewContext.yFactor = minYFactor + (0.8 - minYFactor) * q.tilt;
        viewContext.shiftX = 0;
        viewContext.shiftY = 0;

        const lastBodyOffset = state.lastStaticPose.rotation?.bodyOffset ?? 0;
        const currentBodyOffset = state.currentStaticPose.rotation?.bodyOffset ?? 0;
        const sEased = state.staticBlendFactor * state.staticBlendFactor;
        const blendedBodyOffset = blend(lastBodyOffset, currentBodyOffset, sEased);
        const t = ease(state.poseFactor);
        const finalBodyOffset = blend(blendedBodyOffset, 0, t);
        const finalRenderRotation = q.rotation + finalBodyOffset;

        const rigData = calculateCharacterRig(
            { ...state, staticBlendFactor: state.staticBlendFactor },
            q.cycle,
            config,
            rig,
            poses,
            actor,
        );
        const scene = projectRig(rigData, finalRenderRotation, viewContext, config, rig);
        const canvas = drawCharacterToCanvas(
            sharedCanvas,
            sharedCtx,
            scene,
            actor,
            viewContext,
            finalRenderRotation,
            config,
            rig,
            sceneRenderer,
            spriteCache.cachePadding,
            finalRenderRotation,
        );

        return spriteCache.set(cacheKey, canvas);
    }

    function clearActorState(actorId) {
        entityStates.delete(actorId);
    }

    return {
        config,
        rig,
        poses,
        advanceAnimation,
        buildSprite,
        clearActorState,
        clearAllStates: () => entityStates.clear(),
    };
}
