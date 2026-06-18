import { drawSphere } from "../../Libraries/Render/Props3D/sphere.js";
import { drawSphereTexturePatch } from "../../Libraries/Render/SurfaceTexturing/drawSphereTexturePatch.js";
import { createOffscreenCanvas } from "../../Libraries/Canvas/offscreenCanvas.js";
const POOL_BALL_COLORS = { 1: "#FFD600", 2: "#1565C0", 3: "#D32F2F", 4: "#7B1FA2", 5: "#FF6F00", 6: "#2E7D32", 7: "#8B0000", 8: "#1A1A1A" };
/** @param {string} hex @param {number} amount */
function shadeHex(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) * (1 - amount)) | 0;
    const g = Math.max(0, ((n >> 8) & 0xff) * (1 - amount)) | 0;
    const b = Math.max(0, (n & 0xff) * (1 - amount)) | 0;
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
/** @param {{ kind: "cue" | "solid" | "stripe", number?: number, color?: string }} poolBall */
function resolvePoolBallColor(poolBall) {
    if (poolBall.kind === "cue") return "#F5F5F0";
    const num = poolBall.number ?? 1;
    return poolBall.color ?? POOL_BALL_COLORS[((num - 1) % 8) + 1] ?? "#888888";
}
/** @param {object} face @param {{ kind: "cue" | "solid" | "stripe", number?: number, color?: string }} poolBall @param {number} faceShade */
function resolvePoolBallFaceColor(face, poolBall, faceShade) {
    const vMid = (face.lat0 + face.lat1) * 0.5;
    const base = resolvePoolBallColor(poolBall);
    if (poolBall.kind === "stripe" && vMid > 0.26 && vMid < 0.74) return "#F5F5F5";
    if (poolBall.kind === "cue") return vMid < 0.2 || vMid > 0.8 ? shadeHex(base, faceShade * 0.6) : base;
    return vMid < 0.18 || vMid > 0.82 ? shadeHex(base, faceShade) : base;
}
const labelCache = new Map();
/** Label decal source — not the prop bake canvas (that stays ~86px at zoom 1). */
function poolBallLabelCanvasSize(radius) {
    return Math.max(32, Math.min(64, Math.round(radius * 16)));
}
/** @param {{ kind: "cue" | "solid" | "stripe", number?: number }} poolBall @param {number} radius @param {boolean} compact */
function getPoolBallLabelImage(poolBall, radius, compact) {
    const labelSize = poolBallLabelCanvasSize(radius);
    const key = `${poolBall.kind}_${poolBall.number ?? 0}_${labelSize}`;
    if (labelCache.has(key)) return labelCache.get(key);
    if (poolBall.kind === "cue") {
        const canvas = createOffscreenCanvas(labelSize, labelSize);
        const ctx = canvas.getContext("2d");
        const cx = labelSize * 0.5;
        const cy = labelSize * 0.5;
        const dotR = labelSize * (compact ? 0.32 : 0.28);
        ctx.fillStyle = "#D32F2F";
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();
        labelCache.set(key, canvas);
        return canvas;
    }
    if (!poolBall.number) return null;
    const canvas = createOffscreenCanvas(labelSize, labelSize);
    const ctx = canvas.getContext("2d");
    const cx = labelSize * 0.5;
    const cy = labelSize * 0.5;
    const discR = labelSize * (compact ? 0.47 : 0.46);
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.fill();
    const fontSize = poolBall.number >= 10 ? discR * (compact ? 1.28 : 1.25) : discR * (compact ? 1.62 : 1.55);
    ctx.fillStyle = "#111111";
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = String(poolBall.number);
    const textY = cy + fontSize * 0.03;
    ctx.fillText(label, cx, textY);
    if (compact) {
        ctx.lineWidth = Math.max(1, fontSize * 0.045);
        ctx.strokeStyle = "#111111";
        ctx.strokeText(label, cx, textY);
    }
    labelCache.set(key, canvas);
    return canvas;
}
/** @param {object} visuals */
export function createPoolBallDraw(visuals) {
    return (ctx, prop, px, py) => {
        const poolBall = prop.poolBall ?? visuals.defaultPoolBall;
        const radius = prop.radius;
        const compact = radius < 6;
        drawSphere(ctx, prop, px, py, {
            baseRadius: radius,
            panelCount: visuals.panelCount,
            latBands: visuals.latBands,
            stroke: visuals.stroke,
            getFaceColor: poolBall ? (face) => resolvePoolBallFaceColor(face, poolBall, visuals.faceShade) : undefined,
            panelColors: poolBall ? [poolBall.color ?? resolvePoolBallColor(poolBall)] : visuals.panels,
        });
        if (!poolBall || !visuals.showLabels) return;
        const label = getPoolBallLabelImage(poolBall, radius, compact);
        if (!label) return;
        drawSphereTexturePatch(ctx, prop, px, py, label, {
            baseRadius: radius,
            phiCenter: Math.PI * 0.5,
            thetaCenter: 0,
            capAngle: visuals.labelCapAngle,
            gridSegments: visuals.labelGridSegments,
            subSegments: visuals.labelSubSegments,
            radiusInflate: 1,
            uvBleed: 1,
            screenBleed: 0,
        });
    };
}
const POOL_BALL_RADIUS = 4;
const POOL_BALL_PHYSICS = {
    radius: POOL_BALL_RADIUS,
    /** World-diameter bake — skips global propPixelSize (32) upscaling that blew sprites to ~680px. */
    propPixelSize: POOL_BALL_RADIUS * 2,
    isKinetic: true,
    rolls: true,
    density: 0.001243,
    pairRestitution: 0.92,
    friction: 0.5,
    lowSpeedFrictionThreshold: 2.5,
    lowSpeedFriction: 2.8,
    snapSpeed: 0.45,
    wallPhysics: { restitution: 0.94, friction: 0.06 },
    getCustomSpriteCacheKey: (prop) => {
        const pb = prop.poolBall;
        return pb ? `pb${pb.kind}_${pb.number ?? 0}` : "";
    },
};
const POOL_BALL_VISUALS = {
    defaultRadius: POOL_BALL_RADIUS,
    panelCount: 10,
    latBands: 6,
    stroke: null,
    faceShade: 0.06,
    labelCapAngle: 0.78,
    labelGridSegments: 12,
    labelSubSegments: 1,
    showLabels: false,
};
/** @param {number} number */
function poolBallVisuals(number) {
    const color = POOL_BALL_COLORS[((number - 1) % 8) + 1];
    const defaultPoolBall = number <= 8 ? { kind: "solid", number, color } : { kind: "stripe", number, color };
    return { ...POOL_BALL_VISUALS, defaultPoolBall };
}
/** @param {number} number */
function numberedPoolBall(number) {
    const visuals = poolBallVisuals(number);
    return { id: `pool_ball_${number}`, sandbox: { spawnable: false }, physics: POOL_BALL_PHYSICS, visuals, draw: createPoolBallDraw(visuals) };
}
/** @type {Record<string, object>} */
const poolBalls = {};
poolBalls.pool_cue_ball = (() => {
    const visuals = { ...POOL_BALL_VISUALS, defaultPoolBall: { kind: "cue" } };
    return { id: "pool_cue_ball", sandbox: { spawnable: false }, physics: POOL_BALL_PHYSICS, visuals, draw: createPoolBallDraw(visuals) };
})();
for (let n = 1; n <= 15; n++) poolBalls[`pool_ball_${n}`] = numberedPoolBall(n);
poolBalls.pool_rack_8ball = { id: "pool_rack_8ball", sandbox: { spawnable: true, spawnLabel: "8-ball triangle", spawnRack: "8ball" }, physics: { renderMode: "none" } };
poolBalls.pool_rack_9ball = { id: "pool_rack_9ball", sandbox: { spawnable: true, spawnLabel: "9-ball triangle", spawnRack: "9ball" }, physics: { renderMode: "none" } };
export default poolBalls;
