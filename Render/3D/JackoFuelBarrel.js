import { isFaceTowardViewer } from "./Projection3D.js";
import { pointOnFrustum } from "./Projection3D.js";
import {
    drawExtrudedRadial,
    drawRadialBand,
    RADIAL_SEGMENTS,
} from "./SolidDraw.js";
import { buildSodaCanMesh } from "./CylinderMesh.js";
import { drawTexturedCylinderInspect, onCylinderTexturesReady } from "./CylinderInspect.js";
import { vec3, pushTriangle, transformPoint, projectPoint, createInspectCamera } from "./Mesh3D.js";
import { getTexture, loadTexture } from "./TextureCache.js";

export const JACKO_LABEL_SRC = "Images/jacko_fuel_barrel.png";
const CAN_COMBAT_HEIGHT = 22;
const LABEL_BAND_T0 = 0.28;
const LABEL_BAND_T1 = 0.72;

const CAN_COLORS = {
    body: { shadow: "#7A8088", mid: "#B4BAC2", highlight: "#E2E6EC" },
    bodyFire: { shadow: "#4A2018", mid: "#8A3020", highlight: "#C04828" },
    lip: "#9AA0A8",
    top: "#C8CDD4",
    stroke: "#505860",
    tab: "#D8DCE2",
};

export function preloadJackoFuelLabel() {
    return loadTexture(JACKO_LABEL_SRC);
}

export function onJackoFuelLabelReady(fn) {
    onCylinderTexturesReady({ label: JACKO_LABEL_SRC }, fn);
}

function normalizeAngle(a) {
    while (a <= -Math.PI) a += Math.PI * 2;
    while (a > Math.PI) a -= Math.PI * 2;
    return a;
}

function angleInLabelArc(angle, frontAngle, arcHalf) {
    return Math.abs(normalizeAngle(angle - frontAngle)) <= arcHalf;
}

function labelU(angle, frontAngle, arcHalf) {
    return (normalizeAngle(angle - frontAngle) + arcHalf) / (arcHalf * 2);
}

function drawImageTriangle(ctx, img, s0, s1, s2, d0, d1, d2) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d0.x, d0.y);
    ctx.lineTo(d1.x, d1.y);
    ctx.lineTo(d2.x, d2.y);
    ctx.closePath();
    ctx.clip();

    const denom = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
    if (Math.abs(denom) < 0.001) {
        ctx.restore();
        return;
    }

    const m11 = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom;
    const m12 = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom;
    const m21 = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom;
    const m22 = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denom;
    const dx = d0.x - m11 * s0.x - m21 * s0.y;
    const dy = d0.y - m12 * s0.x - m22 * s0.y;

    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
}

function drawImageQuad(ctx, img, sx0, sy0, sx1, sy1, d0, d1, d2, d3) {
    drawImageTriangle(ctx, img, { x: sx0, y: sy0 }, { x: sx1, y: sy0 }, { x: sx1, y: sy1 }, d0, d1, d2);
    drawImageTriangle(ctx, img, { x: sx0, y: sy0 }, { x: sx1, y: sy1 }, { x: sx0, y: sy1 }, d0, d2, d3);
}

function drawCylindricalLabelCombat(ctx, pc, img, { baseRadius, height, t0, t1, facing, arcHalf = 0.92 }) {
    const projection = pc.project(height);
    const resolvedTop = baseRadius * (1 + projection.alpha);
    const { cx, cy } = projection;
    const frontAngle = Math.atan2(pc.py - pc.y, pc.px - pc.x);
    const iw = img.width;
    const ih = img.height;

    for (let i = 0; i < RADIAL_SEGMENTS; i++) {
        const a0 = facing + (i / RADIAL_SEGMENTS) * Math.PI * 2;
        const a1 = facing + ((i + 1) / RADIAL_SEGMENTS) * Math.PI * 2;
        const midA = (a0 + a1) / 2;
        if (!angleInLabelArc(midA, frontAngle, arcHalf)) continue;

        const edgeMidX = (
            pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0).x
            + pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1).x
        ) / 2;
        const edgeMidY = (
            pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0).y
            + pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1).y
        ) / 2;
        if (!isFaceTowardViewer(edgeMidX, edgeMidY, cx, cy, pc.px, pc.py)) continue;

        const p0a = pointOnFrustum(projection, baseRadius, resolvedTop, t0, a0);
        const p0b = pointOnFrustum(projection, baseRadius, resolvedTop, t0, a1);
        const p1a = pointOnFrustum(projection, baseRadius, resolvedTop, t1, a0);
        const p1b = pointOnFrustum(projection, baseRadius, resolvedTop, t1, a1);

        const u0 = labelU(a0, frontAngle, arcHalf) * iw;
        const u1 = labelU(a1, frontAngle, arcHalf) * iw;

        drawImageQuad(ctx, img, u0, 0, u1, ih, p1a, p1b, p0b, p0a);
    }
}

function drawCanTopCombat(ctx, pc, radius, height, onFire) {
    const projection = pc.project(height);
    const { topX, topY, alpha } = projection;
    const lipRadius = radius * 1.07;
    const capRadius = radius * 0.88;

    ctx.fillStyle = onFire ? "#6A3020" : CAN_COLORS.lip;
    ctx.strokeStyle = CAN_COLORS.stroke;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(topX, topY, lipRadius * (1 + alpha * 0.15), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const grad = ctx.createRadialGradient(topX, topY, 0, topX, topY, capRadius * (1 + alpha * 0.1));
    grad.addColorStop(0, onFire ? "#8A4030" : CAN_COLORS.top);
    grad.addColorStop(0.65, onFire ? "#5A2818" : "#A8ADB4");
    grad.addColorStop(1, onFire ? "#3A1810" : CAN_COLORS.lip);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(topX, topY, capRadius * (1 + alpha * 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = onFire ? "#C0A090" : CAN_COLORS.tab;
    ctx.beginPath();
    ctx.ellipse(topX + radius * 0.12, topY - radius * 0.08, radius * 0.22, radius * 0.1, -0.35, 0, Math.PI * 2);
    ctx.fill();
}

function drawJackoFuelLabel(ctx, cx, cy, width, height) {
    ctx.fillStyle = "#EDE6D8";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = Math.max(0.8, width * 0.04);
    ctx.beginPath();
    ctx.rect(cx - width / 2, cy - height / 2, width, height);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.font = `900 ${height * 0.34}px Impact, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("JACKO", cx, cy - height * 0.1);
    ctx.font = `800 ${height * 0.22}px Impact, monospace`;
    ctx.fillText("FUEL", cx, cy + height * 0.22);
}

function drawLabelOnVisibleBand(ctx, pc, slice1, slice2, x, y, px, py) {
    if (!isFaceTowardViewer(slice1.centerX, slice1.centerY, x, y, px, py)) return;
    const midX = (slice1.centerX + slice2.centerX) / 2;
    const midY = (slice1.centerY + slice2.centerY) / 2;
    const bandW = slice1.size * 1.55;
    const bandH = (slice2.centerY - slice1.centerY) * 0.85 + slice1.size * 0.35;
    const angle = Math.atan2(slice2.centerY - slice1.centerY, slice2.centerX - slice1.centerX) + Math.PI / 2;
    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angle);
    drawJackoFuelLabel(ctx, 0, 0, bandW, Math.max(bandH, bandW * 0.42));
    ctx.restore();
}

export function drawJackoFuelBarrelCombat(ctx, pc, { onFire = false } = {}) {
    const radius = pc.prop.radius || 8;
    const colors = onFire ? CAN_COLORS.bodyFire : CAN_COLORS.body;
    const { facing, x, y, px, py } = pc;

    drawExtrudedRadial(ctx, pc, {
        baseRadius: radius,
        height: CAN_COMBAT_HEIGHT,
        colors,
        stroke: CAN_COLORS.stroke,
    });

    const { slice1, slice2 } = drawRadialBand(ctx, pc, {
        baseRadius: radius,
        height: CAN_COMBAT_HEIGHT,
        t0: LABEL_BAND_T0,
        t1: LABEL_BAND_T1,
        fill: onFire ? "rgba(60, 20, 12, 0.35)" : "rgba(120, 125, 132, 0.25)",
        stroke: CAN_COLORS.stroke,
    });

    const labelImg = getTexture(JACKO_LABEL_SRC);
    if (labelImg) {
        drawCylindricalLabelCombat(ctx, pc, labelImg, {
            baseRadius: radius,
            height: CAN_COMBAT_HEIGHT,
            t0: LABEL_BAND_T0,
            t1: LABEL_BAND_T1,
            facing,
        });
    } else {
        drawLabelOnVisibleBand(ctx, pc, slice1, slice2, x, y, px, py);
    }

    drawCanTopCombat(ctx, pc, radius, CAN_COMBAT_HEIGHT, onFire);
}

function appendPullTab(mesh, halfHeight, bodyRadius, onFire) {
    const y = halfHeight + 0.035;
    const tabColor = onFire ? "#C0A090" : CAN_COLORS.tab;
    mesh.materials.tab = { type: "solid", color: tabColor, stroke: CAN_COLORS.stroke, lineWidth: 0.5 };

    const a = vec3(bodyRadius * 0.14, y, -bodyRadius * 0.04);
    const b = vec3(bodyRadius * 0.32, y + 0.005, -bodyRadius * 0.18);
    const c = vec3(bodyRadius * 0.08, y - 0.015, -bodyRadius * 0.01);
    const d = vec3(-bodyRadius * 0.06, y + 0.005, bodyRadius * 0.1);
    pushTriangle(mesh.triangles, a, b, c, "tab");
    pushTriangle(mesh.triangles, a, c, d, "tab");
}

export function drawJackoFuelBarrelInspect(ctx, cx, cy, scale, yaw, pitch, { onFire = false } = {}) {
    const mesh = buildSodaCanMesh({ onFire });
    appendPullTab(mesh, 1.05, 0.5, onFire);

    drawTexturedCylinderInspect(ctx, cx, cy, scale, yaw, pitch, {
        mesh,
        textureSources: { label: JACKO_LABEL_SRC },
    });

    if (onFire) {
        const camera = createInspectCamera(cx, cy, scale, yaw, pitch);
        const time = Date.now();
        for (let i = 0; i < 4; i++) {
            const local = vec3(
                Math.sin(time * 0.006 + i * 1.7) * 0.1,
                1.05 + 0.32 + i * 0.07 + Math.sin(time * 0.009 + i) * 0.05,
                Math.cos(time * 0.007 + i) * 0.07,
            );
            const p = transformPoint(local, yaw, pitch);
            const q = projectPoint(p, camera);
            if (!q) continue;
            const grad = ctx.createRadialGradient(q.x, q.y, 2, q.x, q.y, 12 + i * 3);
            grad.addColorStop(0, "#FFE082");
            grad.addColorStop(0.5, "#FF9100");
            grad.addColorStop(1, "rgba(255, 80, 0, 0)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(q.x, q.y, 12 + i * 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

preloadJackoFuelLabel();
