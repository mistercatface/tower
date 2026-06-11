import { getPropAsset } from "../../Props/PropCatalog.js";
import { PolygonShape } from "../../Spatial/collision/Shapes.js";
import { quantizeAngleIndex } from "../../Canvas/viewQuantize.js";
export const FLIPPER_BEHAVIOR_ID = "flipper";
const SWING_SPEED_RAD = 20;
const RETURN_SPEED_RAD = 8;
const PIVOT_RADIUS = 5;
const BUTTON_RADIUS = 13;
const FLIPPER_ANGLE_STEPS = 24;
/** @param {object} pickup */
export function isFlipperPickup(pickup) {
    return Boolean(getPropAsset(pickup?.type)?.flipper?.side);
}
/** @param {object} asset */
function flipperConfig(asset) {
    return asset?.flipper ?? {};
}
/** @param {object} pickup @param {object} asset */
export function getFlipperSpec(pickup, asset) {
    const cfg = flipperConfig(asset);
    return {
        side: cfg.side ?? "left",
        extendDir: cfg.extendDir ?? 1,
        length: cfg.length ?? 32,
        width: cfg.width ?? 8,
        restAngle: pickup._flipperRestAngle ?? cfg.restAngle ?? 0.45,
        activeAngle: pickup._flipperActiveAngle ?? cfg.activeAngle ?? -0.55,
        buttonOutside: cfg.buttonOutside ?? -1,
        buttonGap: cfg.buttonGap ?? 14,
        buttonYOffset: cfg.buttonYOffset ?? 0,
    };
}
/** @param {object} prop */
export function getFlipperSpriteCacheKey(prop) {
    const asset = getPropAsset(prop.type);
    const cfg = flipperConfig(asset);
    const angle = prop._flipperAngle ?? cfg.restAngle ?? 0.45;
    const active = prop._flipperTarget === "active" || prop._flipperButtonPressed ? 1 : 0;
    return `${cfg.side ?? "left"}_a${quantizeAngleIndex(angle, FLIPPER_ANGLE_STEPS)}_${active}`;
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
/** @param {object} pickup @param {object} asset */
function getButtonPosition(pickup, asset) {
    const spec = getFlipperSpec(pickup, asset);
    const rest = spec.restAngle;
    const halfW = spec.width * 0.5;
    const tipX = Math.cos(rest) * spec.length * spec.extendDir;
    const paddleLeft = Math.min(-PIVOT_RADIUS, tipX - halfW);
    const paddleRight = Math.max(PIVOT_RADIUS, tipX + halfW);
    const xOffset = spec.buttonOutside < 0 ? paddleLeft - spec.buttonGap - BUTTON_RADIUS : paddleRight + spec.buttonGap + BUTTON_RADIUS;
    return { x: pickup.x + xOffset, y: pickup.y + spec.buttonYOffset };
}
/** @param {object} pickup @param {number} wx @param {number} wy */
function hitFlipButton(pickup, wx, wy) {
    const asset = getPropAsset(pickup.type);
    if (!asset) return false;
    initFlipperAngle(pickup, asset);
    const btn = getButtonPosition(pickup, asset);
    return Math.hypot(wx - btn.x, wy - btn.y) <= BUTTON_RADIUS + 4;
}
/** @param {object} pickup */
function activateFlipper(pickup) {
    pickup._flipperTarget = "active";
    pickup._flipperButtonPressed = true;
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
/** @param {CanvasRenderingContext2D} ctx @param {object} pickup */
function drawFlipperButton(ctx, pickup) {
    const asset = getPropAsset(pickup.type);
    if (!asset) return;
    initFlipperAngle(pickup, asset);
    const btn = getButtonPosition(pickup, asset);
    const pressed = pickup._flipperButtonPressed || pickup._flipperTarget === "active";
    drawArcadeButton(ctx, btn.x, btn.y, pressed);
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {boolean} pressed */
function drawArcadeButton(ctx, x, y, pressed) {
    const r = BUTTON_RADIUS;
    const lineScale = 1 / Math.max(0.001, ctx.getTransform().a);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pressed ? 0.88 : 1, pressed ? 0.88 : 1);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    grad.addColorStop(0, pressed ? "#FFAB91" : "#FF7043");
    grad.addColorStop(1, pressed ? "#BF360C" : "#E64A19");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3E2723";
    ctx.lineWidth = 2.5 * lineScale;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.28, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1.5 * lineScale;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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
/** @param {CanvasRenderingContext2D} ctx @param {import("../SandboxHostPort.js").SandboxHostPort} host */
function drawAllFlipperButtons(ctx, host) {
    const pickups = host.getPickups();
    for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (pickup.isDead || !isFlipperPickup(pickup)) continue;
        drawFlipperButton(ctx, pickup);
    }
}
/** @returns {import("../createSandboxController.js").SandboxBehavior} */
export function createFlipperBehavior() {
    return {
        id: FLIPPER_BEHAVIOR_ID,
        supports(_pickup, asset) {
            return asset?.sandbox?.behaviors?.includes(FLIPPER_BEHAVIOR_ID) ?? false;
        },
        tryCanvasInput(world, _e, host) {
            const pickups = host.getPickups();
            for (let i = pickups.length - 1; i >= 0; i--) {
                const pickup = pickups[i];
                if (pickup.isDead || !isFlipperPickup(pickup)) continue;
                if (!hitFlipButton(pickup, world.x, world.y)) continue;
                activateFlipper(pickup);
                return true;
            }
            return false;
        },
        tickWorld(dt, host) {
            tickAllFlippers(host, dt);
        },
        drawWorldOverlay(ctx, host) {
            drawAllFlipperButtons(ctx, host);
        },
        onPointerDown: () => false,
        onPointerMove() {},
        onPointerUp() {},
        reset() {},
    };
}
