import { POOL_BALL_RADIUS, POOL_VISUAL } from "../../Sandbox/poolConfig.js";
/** Standard pool ball palette (solids 1–8, stripes 9–15 share colors). */
export const POOL_BALL_COLORS = { 1: "#FFD600", 2: "#1565C0", 3: "#D32F2F", 4: "#7B1FA2", 5: "#FF6F00", 6: "#2E7D32", 7: "#8B0000", 8: "#1A1A1A" };
/**
 * @param {string} hex
 * @param {number} amount 0–1 darken factor
 */
function shadeHex(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) * (1 - amount)) | 0;
    const g = Math.max(0, ((n >> 8) & 0xff) * (1 - amount)) | 0;
    const b = Math.max(0, (n & 0xff) * (1 - amount)) | 0;
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
/**
 * @param {{ kind: 'cue' | 'solid' | 'stripe', number?: number, color?: string }} poolBall
 */
export function resolvePoolBallColor(poolBall) {
    if (poolBall.kind === "cue") return "#F5F5F0";
    const num = poolBall.number ?? 1;
    return poolBall.color ?? POOL_BALL_COLORS[((num - 1) % 8) + 1] ?? "#888888";
}
/**
 * Face fill for low-poly sphere panels.
 *
 * @param {object} face
 * @param {{ kind: 'cue' | 'solid' | 'stripe', number?: number, color?: string }} poolBall
 */
export function resolvePoolBallFaceColor(face, poolBall) {
    const vMid = (face.lat0 + face.lat1) * 0.5;
    const base = resolvePoolBallColor(poolBall);
    const shade = POOL_VISUAL.faceShade ?? 0.12;
    if (poolBall.kind === "stripe" && vMid > 0.26 && vMid < 0.74) return "#F5F5F5";
    if (poolBall.kind === "cue") return vMid < 0.2 || vMid > 0.8 ? shadeHex(base, shade * 0.6) : base;
    return vMid < 0.18 || vMid > 0.82 ? shadeHex(base, shade) : base;
}
const LABEL_SIZE = POOL_BALL_RADIUS < 6 ? 512 : 384;
const labelCache = new Map();
/**
 * Square decal atlas for spherical cap UV (transparent outside the white disc).
 *
 * @param {{ kind: 'cue' | 'solid' | 'stripe', number?: number }} poolBall
 * @returns {OffscreenCanvas | null}
 */
export function getPoolBallLabelImage(poolBall) {
    const key = `${poolBall.kind}_${poolBall.number ?? 0}_${LABEL_SIZE}`;
    if (labelCache.has(key)) return labelCache.get(key);
    const compact = POOL_BALL_RADIUS < 6;
    if (poolBall.kind === "cue") {
        const canvas = new OffscreenCanvas(LABEL_SIZE, LABEL_SIZE);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        const cx = LABEL_SIZE * 0.5;
        const cy = LABEL_SIZE * 0.5;
        const dotR = LABEL_SIZE * (compact ? 0.32 : 0.28);
        ctx.fillStyle = "#D32F2F";
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();
        labelCache.set(key, canvas);
        return canvas;
    }
    if (!poolBall.number) return null;
    const canvas = new OffscreenCanvas(LABEL_SIZE, LABEL_SIZE);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const cx = LABEL_SIZE * 0.5;
    const cy = LABEL_SIZE * 0.5;
    const discR = LABEL_SIZE * (compact ? 0.47 : 0.46);
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
/**
 * Build poolBall metadata from a ball number (1–15).
 *
 * @param {number} number
 */
export function poolBallFromNumber(number) {
    const color = POOL_BALL_COLORS[((number - 1) % 8) + 1];
    if (number === 0 || number > 15) return { kind: "cue", color: "#F5F5F0" };
    if (number <= 8) return { kind: "solid", number, color };
    return { kind: "stripe", number, color };
}
