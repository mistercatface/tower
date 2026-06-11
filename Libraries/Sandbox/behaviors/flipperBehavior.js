import { getPropAsset } from "../../Props/PropCatalog.js";
import { applyImpulse } from "../../Motion/applyImpulse.js";
import { wakePushableBody } from "../../Motion/pushableSleep.js";
export const FLIPPER_BEHAVIOR_ID = "flipper";
const SWING_SPEED_RAD = 20;
const RETURN_SPEED_RAD = 8;
const SWING_FORCE = 2600;
const PIVOT_RADIUS = 5;
const BUTTON_RADIUS = 13;
/** @param {object} pickup @param {object} asset */
function getFlipperSpec(pickup, asset) {
    return {
        length: asset?.flipper?.length ?? 32,
        width: asset?.flipper?.width ?? 8,
        restAngle: pickup._flipperRestAngle ?? asset?.flipper?.restAngle ?? 0.45,
        activeAngle: pickup._flipperActiveAngle ?? asset?.flipper?.activeAngle ?? -0.55,
    };
}
/** @param {object} pickup @param {object} asset */
function initFlipperAngle(pickup, asset) {
    if (pickup._flipperAngle == null) {
        pickup._flipperAngle = pickup._flipperRestAngle ?? asset?.flipper?.restAngle ?? 0.45;
        pickup._flipperTarget = "rest";
    }
}
/** @param {object} pickup @param {object} asset */
function getButtonPosition(pickup, asset) {
    const spec = getFlipperSpec(pickup, asset);
    const rest = spec.restAngle;
    const halfW = spec.width * 0.5;
    const tipX = Math.cos(rest) * spec.length;
    const gap = asset?.flipper?.buttonGap ?? 14;
    const paddleLeft = Math.min(-PIVOT_RADIUS, tipX - halfW);
    return { x: pickup.x + paddleLeft - gap - BUTTON_RADIUS, y: pickup.y + (asset?.flipper?.buttonYOffset ?? 0) };
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
/** @param {object} pickup @param {object} asset @param {number} dt @param {object[]} pickups */
function tickFlipperPickup(pickup, asset, dt, pickups) {
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
    if (!isActivating && pickup._flipperButtonPressed) pickup._flipperButtonPressed = false;
    if (isActivating && Math.abs(pickup._flipperAngle - prevAngle) > 0.001) {
        const angVel = (pickup._flipperAngle - prevAngle) / dtSec;
        const midAngle = (prevAngle + pickup._flipperAngle) * 0.5;
        const px = -Math.sin(midAngle) * Math.sign(angVel);
        const py = Math.cos(midAngle) * Math.sign(angVel);
        for (let i = 0; i < pickups.length; i++) {
            const other = pickups[i];
            if (other === pickup || other.isDead) continue;
            if (other.vx === undefined) continue;
            const dx = other.x - pickup.x;
            const dy = other.y - pickup.y;
            const dist = Math.hypot(dx, dy);
            if (dist > spec.length + (other.radius ?? 8)) continue;
            const ballAngle = Math.atan2(dy, dx);
            const lo = Math.min(prevAngle, pickup._flipperAngle) - 0.5;
            const hi = Math.max(prevAngle, pickup._flipperAngle) + 0.5;
            if (ballAngle < lo || ballAngle > hi) continue;
            const distScale = 0.4 + 0.6 * Math.min(1, dist / spec.length);
            applyImpulse(other, px * SWING_FORCE * distScale, py * SWING_FORCE * distScale);
            wakePushableBody(other);
        }
    }
}
/** @param {CanvasRenderingContext2D} ctx @param {object} pickup */
function drawFlipperPickup(ctx, pickup) {
    const asset = getPropAsset(pickup.type);
    if (!asset) return;
    initFlipperAngle(pickup, asset);
    const spec = getFlipperSpec(pickup, asset);
    const angle = pickup._flipperAngle;
    const tx = Math.cos(angle) * spec.length;
    const ty = Math.sin(angle) * spec.length;
    const isActive = pickup._flipperTarget === "active";
    const armColor = isActive ? "#EF5350" : "#546E7A";
    const armStroke = isActive ? "#B71C1C" : "#263238";
    const btn = getButtonPosition(pickup, asset);
    const pressed = pickup._flipperButtonPressed || isActive;
    ctx.save();
    ctx.lineCap = "round";
    ctx.translate(pickup.x, pickup.y);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = armStroke;
    ctx.lineWidth = spec.width + 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = armColor;
    ctx.lineWidth = spec.width;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, PIVOT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#90A4AE";
    ctx.fill();
    ctx.strokeStyle = armStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
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
/** @param {object[]} pickups @param {number} dt */
export function tickFlippers(pickups, dt) {
    for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (pickup.isDead || pickup.type !== "flipper") continue;
        const asset = getPropAsset(pickup.type);
        if (!asset) continue;
        tickFlipperPickup(pickup, asset, dt, pickups);
    }
}
/** @param {CanvasRenderingContext2D} ctx @param {object[]} pickups */
export function drawFlippers(ctx, pickups) {
    for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (pickup.isDead || pickup.type !== "flipper") continue;
        drawFlipperPickup(ctx, pickup);
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
                if (pickup.isDead || pickup.type !== "flipper") continue;
                if (!hitFlipButton(pickup, world.x, world.y)) continue;
                activateFlipper(pickup);
                return true;
            }
            return false;
        },
        onPointerDown: () => false,
        onPointerMove() {},
        onPointerUp() {},
        reset() {},
    };
}
