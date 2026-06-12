import { getPropAsset } from "../../Props/PropCatalog.js";
import { PolygonShape } from "../../Spatial/collision/Shapes.js";
import { quantizeAngleIndex } from "../../Canvas/viewQuantize.js";
import { FLIPPER_LAYOUT } from "../../../Assets/props/flipper/flipperShared.js";
export const FLIPPER_BEHAVIOR_ID = "flipper";
const SWING_SPEED_RAD = 20;
const RETURN_SPEED_RAD = 8;
const FLIPPER_ANGLE_STEPS = 24;
/** @param {object} prop */
export function isFlipperWorldProp(prop) {
    return Boolean(getPropAsset(prop?.type)?.flipper?.side);
}
/** @param {object} asset */
function flipperConfig(asset) {
    return asset?.flipper ?? {};
}
/** @param {object} cfg @param {number | null} playW */
function resolveFlipperDims(cfg, playW) {
    const u = (key, fallback) => (playW != null ? playW * (cfg[key] ?? FLIPPER_LAYOUT[key] ?? fallback) : fallback);
    const length = u("lengthU", 16);
    const width = u("widthU", 4);
    return { length, width, height: u("heightU", 5), pivotRadius: u("pivotU", 2.5) };
}
/**
 * @param {object} prop
 * @param {ReturnType<typeof import("../assemblyLayout.js").buildAssemblyLayout>} layout
 * @param {object} asset
 */
export function applyFlipperAssemblyScale(prop, layout, asset) {
    const cfg = flipperConfig(asset);
    const playW = layout.play.maxX - layout.play.minX;
    prop._flipperPlayfieldWidth = playW;
    const { length, width } = resolveFlipperDims(cfg, playW);
    prop.halfExtents = { x: length / 2, y: width / 2 };
    prop.radius = Math.max(prop.halfExtents.x, prop.halfExtents.y);
    prop.strategy.propPixelSize = Math.max(length, width * 2);
    prop._flipperShapeKey = null;
}
/** @param {object} prop @param {object} asset */
export function getFlipperSpec(prop, asset) {
    const cfg = flipperConfig(asset);
    const playW = prop._flipperPlayfieldWidth ?? null;
    const dims = resolveFlipperDims(cfg, playW);
    return {
        playfieldWidth: playW,
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
    const asset = getPropAsset(prop.type);
    const cfg = flipperConfig(asset);
    const spec = getFlipperSpec(prop, asset);
    const angle = prop._flipperAngle ?? cfg.restAngle ?? 0.45;
    const active = prop._flipperTarget === "active" || prop._flipperButtonPressed ? 1 : 0;
    const pw = spec.playfieldWidth != null ? Math.round(spec.playfieldWidth) : 0;
    return `${cfg.side ?? "left"}_pw${pw}_L${Math.round(spec.length)}_a${quantizeAngleIndex(angle, FLIPPER_ANGLE_STEPS)}_${active}`;
}
/** @param {object} prop */
export function syncFlipperCollisionShape(prop) {
    const asset = getPropAsset(prop.type);
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
    prop._collisionBoundingRadius = Math.hypot(length, halfW);
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
/** @param {import("../SandboxHostPort.js").SandboxHostPort} host @param {number} dt */
function tickAllFlippers(host, dt) {
    host.forEachWorldProp((prop) => {
        if (prop.isDead || !isFlipperWorldProp(prop)) return;
        const asset = getPropAsset(prop.type);
        if (!asset) return;
        tickFlipperWorldProp(prop, asset, dt);
    });
}
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createFlipperBehavior() {
    return {
        id: FLIPPER_BEHAVIOR_ID,
        supports(_prop, asset) {
            return asset?.sandbox?.behaviors?.includes(FLIPPER_BEHAVIOR_ID) ?? false;
        },
        tickWorld(dt, host) {
            tickAllFlippers(host, dt);
        },
        onPointerDown: () => false,
        onPointerMove() {},
        onPointerUp() {},
        reset() {},
    };
}
