import { getPropAsset } from "../../Props/PropCatalog.js";
import { PolygonShape } from "../../Spatial/collision/Shapes.js";
import { quantizeAngleIndex } from "../../Canvas/viewQuantize.js";
import { FLIPPER_LAYOUT } from "../../../Assets/props/flipper/flipperShared.js";
export const FLIPPER_BEHAVIOR_ID = "flipper";
const SWING_SPEED_RAD = 20;
const RETURN_SPEED_RAD = 8;
const FLIPPER_ANGLE_STEPS = 24;
/** @param {object} pickup */
export function isFlipperPickup(pickup) {
    return Boolean(getPropAsset(pickup?.type)?.flipper?.side);
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
 * @param {object} pickup
 * @param {ReturnType<typeof import("../assemblyLayout.js").buildAssemblyLayout>} layout
 * @param {object} asset
 */
export function applyFlipperAssemblyScale(pickup, layout, asset) {
    const cfg = flipperConfig(asset);
    const playW = layout.play.maxX - layout.play.minX;
    pickup._flipperPlayfieldWidth = playW;
    const { length, width } = resolveFlipperDims(cfg, playW);
    pickup.halfExtents = { x: length / 2, y: width / 2 };
    pickup.radius = Math.max(pickup.halfExtents.x, pickup.halfExtents.y);
    pickup.strategy.propPixelSize = Math.max(length, width * 2);
    pickup._flipperShapeKey = null;
}
/** @param {object} pickup @param {object} asset */
export function getFlipperSpec(pickup, asset) {
    const cfg = flipperConfig(asset);
    const playW = pickup._flipperPlayfieldWidth ?? null;
    const dims = resolveFlipperDims(cfg, playW);
    return {
        playfieldWidth: playW,
        side: cfg.side ?? "left",
        extendDir: cfg.extendDir ?? 1,
        length: dims.length,
        width: dims.width,
        height: dims.height,
        pivotRadius: dims.pivotRadius,
        restAngle: pickup._flipperRestAngle ?? cfg.restAngle ?? 0.45,
        activeAngle: pickup._flipperActiveAngle ?? cfg.activeAngle ?? -0.55,
    };
}
/** @param {object | null | undefined} pickup */
export function triggerFlipper(pickup) {
    if (!pickup) return;
    pickup._flipperTarget = "active";
    pickup._flipperButtonPressed = true;
}
/** @param {object | null | undefined} pickup */
export function isFlipperButtonPressed(pickup) {
    if (!pickup) return false;
    return Boolean(pickup._flipperButtonPressed || pickup._flipperTarget === "active");
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
/** @param {object} pickup @param {object} asset */
function initFlipperAngle(pickup, asset) {
    if (pickup._flipperAngle == null) {
        pickup._flipperAngle = getFlipperSpec(pickup, asset).restAngle;
        pickup._flipperTarget = "rest";
    }
}
/** @param {object} pickup @param {object} asset @param {number} dt */
function tickFlipperPickup(pickup, asset, dt) {
    initFlipperAngle(pickup, asset);
    const spec = getFlipperSpec(pickup, asset);
    const isActivating = pickup._flipperTarget === "active";
    const target = isActivating ? spec.activeAngle : spec.restAngle;
    const speed = isActivating ? SWING_SPEED_RAD : RETURN_SPEED_RAD;
    const dtSec = dt / 1000;
    const prevAngle = pickup._flipperAngle;
    const diff = target - prevAngle;
    const maxStep = speed * dtSec;
    if (Math.abs(diff) <= maxStep) {
        pickup._flipperAngle = target;
        if (isActivating) pickup._flipperTarget = "rest";
    } else pickup._flipperAngle = prevAngle + Math.sign(diff) * maxStep;
    pickup._flipperAngVel = (pickup._flipperAngle - prevAngle) / dtSec;
    pickup.angularVelocity = pickup._flipperAngVel;
    pickup.vx = 0;
    pickup.vy = 0;
    syncFlipperCollisionShape(pickup);
    if (!isActivating && pickup._flipperButtonPressed) pickup._flipperButtonPressed = false;
}
/** @param {import("../SandboxHostPort.js").SandboxHostPort} host @param {number} dt */
function tickAllFlippers(host, dt) {
    const pickups = host.getPickups();
    for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (pickup.isDead || !isFlipperPickup(pickup)) continue;
        const asset = getPropAsset(pickup.type);
        if (!asset) continue;
        tickFlipperPickup(pickup, asset, dt);
    }
}
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createFlipperBehavior() {
    return {
        id: FLIPPER_BEHAVIOR_ID,
        supports(_pickup, asset) {
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
