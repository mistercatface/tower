import { createKinematicsConfig, createKinematicsRig } from "./core/config.js";
import { createKinematicsPoses } from "./core/poses.js";
import { createEntityAnimState, createLocomotionTicker, getQuantizedAimKey, getWeaponLoadoutKey, syncWeaponPose } from "./anim/index.js";
import { createCharacterFrameDrawer, createSceneRenderer } from "../Render/Characters/index.js";
import { createKinematicsSpriteCache } from "../Canvas/QuantizedSpriteCache.js";
import { createCharacterRigCalculator } from "./core/rigCalculator.js";
import { createProjector } from "./core/projector.js";
import { applyRigDeltas } from "./skeleton/adapters.js";
import { clamp } from "../Math/Interpolate.js";
import { createOffscreenCanvas } from "../Canvas/offscreenCanvas.js";
const sharedCanvas = createOffscreenCanvas(300, 150);
const sharedCtx = sharedCanvas.getContext("2d");
export function createKinematicsBundle({ pixelSize, cameraHeight, maxTiltDist = 120, displayDiameter = null, ports }) {
    const { resolveCombatFacing, resolveSpriteBodyRotation, resolveWeaponStaticPoseName, resolveWeaponDrawSlots, resolveMuzzleFromRig, getCharacterForActor, drawHeldWeapons } = ports;
    const { calculateCharacterRig } = createCharacterRigCalculator({ resolveWeaponDrawSlots });
    const { drawKinematicsFrameToCanvas } = createCharacterFrameDrawer({ getCharacterForActor, drawHeldWeapons });
    const config = createKinematicsConfig(pixelSize);
    const rig = createKinematicsRig(config);
    const poses = createKinematicsPoses(config, rig);
    const sceneRenderer = createSceneRenderer(config);
    const spriteCache = createKinematicsSpriteCache();
    const { tickLocomotion } = createLocomotionTicker({ poses, config, resolveWeaponStaticPoseName });
    const entityStates = new Map();
    const perspectiveWarpMultiplier = 0.6;
    const perspectiveHeight = config.SIZE * config.PERSPECTIVE_HEIGHT;
    const actorWorldHeight = (displayDiameter ?? config.SIZE * 0.94) * config.PERSPECTIVE_HEIGHT;
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
        tickLocomotion(state, actor, dt / 1000);
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
        return { yFactor: 0, shiftX: q.dx * globalRatio, shiftY: q.dy * globalRatio, ratio: globalRatio };
    }
    function renderKinematicsFrame(frame) {
        const { x, y, camera, rigData, bodyRotation = 0, animCycle = 0, actor, facing, drawOptions = {}, padding = spriteCache.cachePadding } = frame;
        const viewContext = buildQuantizedViewContext(x, y, camera, bodyRotation, animCycle);
        return drawKinematicsFrameToCanvas(sharedCanvas, sharedCtx, rigData, actor, viewContext, facing, config, rig, sceneRenderer, padding, drawOptions);
    }
    function resolveLiveFrameSpec(actor, camera, options = {}) {
        const { freezePose = false } = options;
        const state = getOrCreateState(actor);
        syncWeaponPose(state, actor, poses, resolveWeaponStaticPoseName, getWeaponLoadoutKey);
        const bodyRotation = resolveSpriteBodyRotation(actor);
        const animCycle = state.animCycle % (Math.PI * 2);
        const { rawTiltFactor, dx, dy } = buildViewContextAt(actor.x, actor.y, camera);
        const q = spriteCache.getQuantizedValues(bodyRotation, animCycle, rawTiltFactor, dx, dy);
        const facing = resolveCombatFacing(actor, state, q.rotation, config);
        const rigData = calculateCharacterRig({ ...state, staticBlendFactor: freezePose ? 1 : state.staticBlendFactor }, q.cycle, config, rig, poses, actor, facing);
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
            cacheMeta: freezePose ? null : { state, q, rawTiltFactor, dx, dy, weaponKey: getWeaponLoadoutKey(actor), aimKey: getQuantizedAimKey(actor, spriteCache.rotationSteps) },
        };
    }
    function cloneRigPoint(p) {
        if (!p) return p;
        return { x: p.x, y: p.y, z: p.z ?? 0 };
    }
    function cloneRigData(rigData) {
        const limb = (l) => ({ p1: cloneRigPoint(l.p1), p2: cloneRigPoint(l.p2), p3: cloneRigPoint(l.p3) });
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
        const canvas = renderKinematicsFrame({ ...frame, padding: spriteCache.cachePadding });
        return spriteCache.set(cacheKey, canvas);
    }
    function clearActorState(actorId) {
        entityStates.delete(actorId);
    }
    function captureActorRigForRagdoll(actor, camera) {
        const frame = resolveLiveFrameSpec(actor, camera, { freezePose: true });
        const rigData = cloneRigData(frame.rigData);
        return { bindFrame: { rigData, bodyRotation: frame.bodyRotation, animCycle: frame.animCycle, facing: frame.facing } };
    }
    function resolveMuzzleWorldPosition(actor, camera, turretIndex, displayDiameter) {
        const frame = resolveLiveFrameSpec(actor, camera);
        const viewContext = buildQuantizedViewContext(frame.x, frame.y, frame.camera, frame.bodyRotation, frame.animCycle);
        const project = createProjector(viewContext, frame.renderRotation, config, rig);
        return resolveMuzzleFromRig(actor, frame.rigData, project, config, frame.facing, turretIndex, displayDiameter);
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
