import { createKinematicsConfig, createKinematicsRig } from "./KinematicsConfig.js";
import { createKinematicsPoses } from "./KinematicsPoses.js";
import { createSceneRenderer } from "./KinematicsSceneRenderer.js";
import { createKinematicsSpriteCache } from "../../Libraries/Canvas/QuantizedSpriteCache.js";
import { calculateCharacterRig } from "./KinematicsRigCalculator.js";
import { createProjector } from "./KinematicsProjector.js";
import { drawKinematicsFrameToCanvas } from "./KinematicsDraw.js";
import { resolveCombatFacing, resolveSpriteBodyRotation } from "./KinematicsFacing.js";
import { normalizeWeaponLoadout } from "../../Combat/equipmentLoadout.js";
import { resolveWeaponStaticPoseName } from "./KinematicsWeaponVisuals.js";
import { resolveMuzzleFromRig } from "./KinematicsMuzzle.js";
import { applyRigDeltas } from "./KinematicsBones.js";
import { quantizeAngleIndex } from "../../Libraries/Math/Angle.js";
import { clamp } from "../../Libraries/Math/Interpolate.js";

const sharedCanvas = new OffscreenCanvas(300, 150);
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
    const turrets = actor.turrets ?? [];
    return `${quantizeAngleIndex(turrets[0]?.angle, rotationSteps)}_${quantizeAngleIndex(turrets[1]?.angle, rotationSteps)}`;
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

export function createKinematicsBundle({ pixelSize, cameraHeight, maxTiltDist = 120, displayDiameter = null }) {
    const config = createKinematicsConfig(pixelSize);
    const rig = createKinematicsRig(config);
    const poses = createKinematicsPoses(config, rig);
    const sceneRenderer = createSceneRenderer(config);
    const spriteCache = createKinematicsSpriteCache();
    const entityStates = new Map();

    const perspectiveWarpMultiplier = 0.6; // Tune this to scale down perspective warp/lean at screen edges
    const perspectiveHeight = config.SIZE * config.PERSPECTIVE_HEIGHT;
    const actorWorldHeight = (displayDiameter ?? (config.SIZE * 0.94)) * config.PERSPECTIVE_HEIGHT;
    const globalRatio = (perspectiveHeight / Math.max(1.0, cameraHeight - actorWorldHeight)) * perspectiveWarpMultiplier;

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

        state.smoothedSpeed = measuredSpeed < state.smoothedSpeed ? state.smoothedSpeed * 0.2 + measuredSpeed * 0.8 : state.smoothedSpeed * 0.5 + measuredSpeed * 0.5;

        const speed = Math.max(0, state.smoothedSpeed);
        const refSpeed = Math.max(1, actor.baseMoveSpeed ?? actor.speed ?? 50);
        const walkPlayback = clamp(speed / refSpeed, 0, 1.15);
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
            state.legPoseFactor = clamp(state.legPoseFactor, 0, 1);

            const weaponPose = poses[resolveWeaponStaticPoseName(actor)] ?? poses.IDLE;
            state.currentStaticPose = weaponPose;
            state.lastStaticPose = weaponPose;
            state.staticBlendFactor = 1;
            state.pose = weaponPose.name;
        } else {
            state.legPoseFactor = 0;
            state.poseFactor += (targetPoseFactor - state.poseFactor) * dtSec * transitionSpeed;
            state.poseFactor = clamp(state.poseFactor, 0, 1);

            if (!isWalking) {
                const idlePose = poses.IDLE;
                if (state.currentStaticPose !== idlePose) {
                    state.lastStaticPose = state.currentStaticPose;
                    state.currentStaticPose = idlePose;
                    state.staticBlendFactor = 0;
                } else {
                    state.staticBlendFactor = clamp(state.staticBlendFactor + dtSec / 0.75, 0, 1);
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


    function buildViewContextAt(x, y, camera) {
        const dx = x - camera.x;
        const dy = y - camera.y;
        const horizontalDist = Math.hypot(dx, dy);
        const rawTiltFactor = clamp(horizontalDist / maxTiltDist, 0, 1);
        return { rawTiltFactor, dx, dy };
    }

    function buildQuantizedViewContext(x, y, camera, bodyRotation, animCycle) {
        const { rawTiltFactor, dx, dy } = buildViewContextAt(x, y, camera);
        const q = spriteCache.getQuantizedValues(bodyRotation, animCycle, rawTiltFactor, dx, dy);
        const yFactor = 0;
        return { yFactor, shiftX: q.dx * globalRatio, shiftY: q.dy * globalRatio, ratio: globalRatio };
    }

    function renderKinematicsFrame(frame) {
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
        const viewContext = buildQuantizedViewContext(x, y, camera, bodyRotation, animCycle);
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

    function resolveLiveFrameSpec(actor, camera, options = {}) {
        const { freezePose = false } = options;
        const state = getOrCreateState(actor);
        syncWeaponPose(state, actor, poses);
        const bodyRotation = resolveSpriteBodyRotation(actor);
        const animCycle = state.animCycle % (Math.PI * 2);
        const { rawTiltFactor, dx, dy } = buildViewContextAt(actor.x, actor.y, camera);
        const q = spriteCache.getQuantizedValues(bodyRotation, animCycle, rawTiltFactor, dx, dy);
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
            renderRotation: facing.renderRotation,
            bodyRotation,
            animCycle,
            actor,
            facing,
            drawOptions: { drawWeapons: true },
            cacheMeta: freezePose
                ? null
                : {
                    state,
                    q,
                    rawTiltFactor,
                    dx,
                    dy,
                    weaponKey: getWeaponLoadoutKey(actor),
                    aimKey: getQuantizedAimKey(actor, spriteCache.rotationSteps),
                },
        };
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

    function resolveCorpseFrame(corpse, camera) {
        const bind = corpse.bindFrame;
        const ragdoll = corpse.ragdoll;
        return {
            x: corpse.x,
            y: corpse.y,
            camera,
            rigData: applyRigDeltas(bind.rigData, ragdoll?.points),
            bodyRotation: bind.bodyRotation,
            animCycle: bind.animCycle,
            actor: corpse.actor,
            facing: bind.facing,
            drawOptions: ragdoll ? { ragdoll, severed: ragdoll.severed } : {},
            padding: spriteCache.cachePadding,
        };
    }

    function buildSprite(actor, camera) {
        const frame = resolveLiveFrameSpec(actor, camera);
        const { state, q, rawTiltFactor, dx, dy, weaponKey, aimKey } = frame.cacheMeta;
        const cacheKey = spriteCache.getKey(actor.id, state.pose, q.rotation, frame.animCycle, state.crouchFactor, rawTiltFactor, weaponKey, aimKey, dx, dy);

        const cached = spriteCache.get(cacheKey);
        if (cached) return cached;

        const canvas = renderKinematicsFrame({
            ...frame,
            padding: spriteCache.cachePadding,
        });

        return spriteCache.set(cacheKey, canvas);
    }

    function clearActorState(actorId) {
        entityStates.delete(actorId);
    }

    /** Snapshot live frame at death. */
    function captureActorRigForRagdoll(actor, camera) {
        const frame = resolveLiveFrameSpec(actor, camera, { freezePose: true });
        const rigData = cloneRigData(frame.rigData);
        return {
            bindFrame: {
                rigData,
                bodyRotation: frame.bodyRotation,
                animCycle: frame.animCycle,
                facing: frame.facing,
            },
        };
    }

    function resolveMuzzleWorldPosition(actor, camera, turretIndex, displayDiameter) {
        const frame = resolveLiveFrameSpec(actor, camera);
        const viewContext = buildQuantizedViewContext(frame.x, frame.y, frame.camera, frame.bodyRotation, frame.animCycle);
        const project = createProjector(viewContext, frame.renderRotation, config, rig);
        return resolveMuzzleFromRig(
            actor,
            frame.rigData,
            project,
            config,
            frame.facing,
            turretIndex,
            displayDiameter,
        );
    }

    return {
        config,
        rig,
        poses,
        sceneRenderer,
        sharedCanvas,
        sharedCtx,
        maxTiltDist,
        globalRatio,
        advanceAnimation,
        buildSprite,
        renderKinematicsFrame,
        resolveCorpseFrame,
        captureActorRigForRagdoll,
        clearActorState,
        clearAllStates: () => entityStates.clear(),
        resolveMuzzleWorldPosition,
    };
}
