import { worldPropAssets } from "../../Props/PropCatalog.js";
import { PolygonShape } from "../../Spatial/collision/Shapes.js";
import { quantizeAngleIndex } from "../../Math/Angle.js";
import { FLIPPER_LAYOUT } from "../../../Assets/props/flipper/flipperShared.js";
export const FLIPPER_BEHAVIOR_ID = "flipper";
const SWING_SPEED_RAD = 20;
const RETURN_SPEED_RAD = 8;
const FLIPPER_ANGLE_STEPS = 24;
/** @param {object} prop */
export function isFlipperWorldProp(prop) {
    return Boolean(worldPropAssets[prop?.type]?.flipper?.side);
}
/** @param {object} asset */
function flipperConfig(asset) {
    return asset?.flipper ?? {};
}
/** @param {object} cfg */
function resolveFlipperDims(cfg) {
    return {
        length: cfg.length ?? FLIPPER_LAYOUT.length,
        width: cfg.width ?? FLIPPER_LAYOUT.width,
        height: cfg.height ?? FLIPPER_LAYOUT.height,
        pivotRadius: cfg.pivotRadius ?? FLIPPER_LAYOUT.pivotRadius,
    };
}
/** @param {object} prop @param {object} asset */
export function getFlipperSpec(prop, asset) {
    const cfg = flipperConfig(asset);
    const dims = resolveFlipperDims(cfg);
    return {
        side: cfg.side ?? "left",
        extendDir: cfg.extendDir ?? 1,
        length: dims.length,
        width: dims.width,
        height: dims.height,
        pivotRadius: dims.pivotRadius,
        restAngle: prop._flipperRestAngle ?? cfg.restAngle ?? 0.45,
        activeAngle: prop._flipperActiveAngle ?? cfg.activeAngle ?? -0.55,
    };
}
/** @param {object | null | undefined} prop @param {{ hold?: boolean }} [options] */
export function triggerFlipper(prop, { hold = true } = {}) {
    if (!prop) return;
    prop._flipperTarget = "active";
    prop._flipperButtonPressed = hold;
}
/** @param {object | null | undefined} prop */
export function releaseFlipper(prop) {
    if (!prop) return;
    prop._flipperTarget = "rest";
    prop._flipperButtonPressed = false;
}
/** @param {object | null | undefined} prop */
export function isFlipperButtonPressed(prop) {
    if (!prop) return false;
    return Boolean(prop._flipperButtonPressed || prop._flipperTarget === "active");
}
/** @param {object} prop */
export function getFlipperSpriteCacheKey(prop) {
    const asset = worldPropAssets[prop.type];
    const cfg = flipperConfig(asset);
    const spec = getFlipperSpec(prop, asset);
    const angle = prop._flipperAngle ?? cfg.restAngle ?? 0.45;
    const active = prop._flipperTarget === "active" || prop._flipperButtonPressed ? 1 : 0;
    return `${cfg.side ?? "left"}_L${Math.round(spec.length)}_a${quantizeAngleIndex(angle, FLIPPER_ANGLE_STEPS)}_${active}`;
}
/** @param {object} prop */
export function syncFlipperCollisionShape(prop) {
    const asset = worldPropAssets[prop.type];
    const spec = getFlipperSpec(prop, asset);
    if (prop._flipperAngle == null) prop._flipperAngle = spec.restAngle;
    const { length, width, extendDir } = spec;
    const halfW = width * 0.5;
    const angle = prop._flipperAngle;
    const key = `flip_${spec.side}_${angle.toFixed(3)}_${length}_${halfW}`;
    if (prop._flipperShapeKey === key && prop.shape?.type === "Polygon") return prop.shape;
    const tipR = Math.max(1, halfW * 0.45);
    prop.shape = new PolygonShape([
        { x: 0, y: -halfW },
        { x: (length - tipR) * extendDir, y: -tipR },
        { x: length * extendDir, y: 0 },
        { x: (length - tipR) * extendDir, y: tipR },
        { x: 0, y: halfW },
    ]);
    prop._collisionFacing = angle;
    prop._flipperShapeKey = key;
    return prop.shape;
}
/** @param {object} prop @param {object} asset */
function initFlipperAngle(prop, asset) {
    if (prop._flipperAngle == null) {
        prop._flipperAngle = getFlipperSpec(prop, asset).restAngle;
        prop._flipperTarget = "rest";
    }
}
/** @param {object} prop @param {object} asset @param {number} dt */
function tickFlipperWorldProp(prop, asset, dt) {
    initFlipperAngle(prop, asset);
    const spec = getFlipperSpec(prop, asset);
    const isActivating = prop._flipperTarget === "active";
    const target = isActivating ? spec.activeAngle : spec.restAngle;
    const speed = isActivating ? SWING_SPEED_RAD : RETURN_SPEED_RAD;
    const dtSec = dt / 1000;
    const prevAngle = prop._flipperAngle;
    const diff = target - prevAngle;
    const maxStep = speed * dtSec;
    if (Math.abs(diff) <= maxStep) {
        prop._flipperAngle = target;
        if (isActivating && !prop._flipperButtonPressed) prop._flipperTarget = "rest";
    } else prop._flipperAngle = prevAngle + Math.sign(diff) * maxStep;
    prop._flipperAngVel = (prop._flipperAngle - prevAngle) / dtSec;
    prop.angularVelocity = prop._flipperAngVel;
    prop.vx = 0;
    prop.vy = 0;
    syncFlipperCollisionShape(prop);
}
/** @param {object} state @param {number} dt */
function tickAllFlippers(state, dt) {
    const worldProps = state.worldProps;
    for (let i = 0; i < worldProps.length; i++) {
        const prop = worldProps[i];
        if (prop.isDead || !isFlipperWorldProp(prop)) continue;
        const asset = worldPropAssets[prop.type];
        if (!asset) continue;
        tickFlipperWorldProp(prop, asset, dt);
    }
}
/** @param {object} state @returns {import("../sandboxCapabilities.js").SandboxBehavior} */
export function createFlipperBehavior(state) {
    return {
        id: FLIPPER_BEHAVIOR_ID,
        supports(_prop, asset) {
            return asset?.sandbox?.behaviors?.includes(FLIPPER_BEHAVIOR_ID) ?? false;
        },
        tickWorld(dt) {
            tickAllFlippers(state, dt);
        },
        onPointerDown: () => false,
        onPointerMove() {},
        onPointerUp() {},
        reset() {},
    };
}
