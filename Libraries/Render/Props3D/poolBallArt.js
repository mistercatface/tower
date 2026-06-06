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
    if (poolBall.kind === "stripe" && vMid > 0.26 && vMid < 0.74) return "#F5F5F5";
    if (poolBall.kind === "cue") return vMid < 0.2 || vMid > 0.8 ? shadeHex(base, 0.06) : base;
    return vMid < 0.18 || vMid > 0.82 ? shadeHex(base, 0.12) : base;
}
const LABEL_SIZE = 384;
const labelCache = new Map();
/**
 * Square decal atlas for spherical cap UV (transparent outside the white disc).
 *
 * @param {{ kind: 'cue' | 'solid' | 'stripe', number?: number }} poolBall
 * @returns {OffscreenCanvas | null}
 */
export function getPoolBallLabelImage(poolBall) {
    if (poolBall.kind === "cue" || !poolBall.number) return null;
    const key = `${poolBall.kind}_${poolBall.number}_${LABEL_SIZE}`;
    if (labelCache.has(key)) return labelCache.get(key);
    const canvas = new OffscreenCanvas(LABEL_SIZE, LABEL_SIZE);
    const ctx = canvas.getContext("2d");
    const cx = LABEL_SIZE * 0.5;
    const cy = LABEL_SIZE * 0.5;
    const discR = LABEL_SIZE * 0.46;
    const onDark = poolBall.kind === "solid" && poolBall.number === 8;
    if (!onDark) {
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(cx, cy, discR, 0, Math.PI * 2);
        ctx.fill();
    }
    const fontSize = poolBall.number >= 10 ? discR * 1.25 : discR * 1.55;
    ctx.fillStyle = onDark ? "#FFFFFF" : "#111111";
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(poolBall.number), cx, cy + fontSize * 0.03);
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
