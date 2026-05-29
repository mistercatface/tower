import { wallTextureSettings } from "../../Config/Config.js";

const textureCache = new Map();

/** Soft color blobs only — no grids, strokes, or mortar lines. */
const PATTERN_SPOTS = {
    brick: [
        { x: 0.3, y: 0.35, r: 0.5, bright: 1.05, mid: 0.52 },
        { x: 0.7, y: 0.65, r: 0.45, bright: 0.92, mid: 0.48 },
        { x: 0.55, y: 0.2, r: 0.35, bright: 0.85, mid: 0.42 },
    ],
    "tech-grid": [
        { x: 0.25, y: 0.25, r: 0.42, bright: 1.1, mid: 0.5 },
        { x: 0.75, y: 0.75, r: 0.42, bright: 1.0, mid: 0.48 },
        { x: 0.75, y: 0.25, r: 0.38, bright: 0.88, mid: 0.44 },
        { x: 0.25, y: 0.75, r: 0.38, bright: 0.88, mid: 0.44 },
    ],
    stripes: [
        { x: 0.35, y: 0.4, r: 0.55, bright: 1.08, mid: 0.5 },
        { x: 0.65, y: 0.6, r: 0.5, bright: 0.9, mid: 0.45 },
        { x: 0.5, y: 0.5, r: 0.6, bright: 0.75, mid: 0.38 },
    ],
    "stone-block": [
        { x: 0.2, y: 0.3, r: 0.4, bright: 1.0, mid: 0.5 },
        { x: 0.6, y: 0.25, r: 0.35, bright: 0.88, mid: 0.46 },
        { x: 0.45, y: 0.7, r: 0.48, bright: 0.95, mid: 0.48 },
        { x: 0.8, y: 0.75, r: 0.32, bright: 0.82, mid: 0.42 },
    ],
    "cyber-core": [
        { x: 0.5, y: 0.5, r: 0.65, bright: 1.2, mid: 0.48 },
        { x: 0.5, y: 0.5, r: 0.35, bright: 0.85, mid: 0.4 },
    ],
    "diamond-mesh": [
        { x: 0.4, y: 0.45, r: 0.5, bright: 0.95, mid: 0.46 },
        { x: 0.6, y: 0.55, r: 0.48, bright: 0.88, mid: 0.42 },
        { x: 0.5, y: 0.5, r: 0.55, bright: 0.72, mid: 0.36 },
    ],
};

function themeKey(theme) {
    return `${theme.r},${theme.g},${theme.b},${theme.patternType || "brick"}`;
}

function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function shadeRgb(theme, amount) {
    return `rgb(${clampByte(theme.r * amount)}, ${clampByte(theme.g * amount)}, ${clampByte(theme.b * amount)})`;
}

function hashNoise(x, y) {
    const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return v - Math.floor(v);
}

function applyTextureSoftening(ctx, size) {
    const imageData = ctx.getImageData(0, 0, size, size);
    const d = imageData.data;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const n = (hashNoise(x, y) - 0.5) * 10;
            d[i] = clampByte(d[i] + n);
            d[i + 1] = clampByte(d[i + 1] + n);
            d[i + 2] = clampByte(d[i + 2] + n);
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

function drawSoftColorWash(ctx, size, theme, spots) {
    ctx.fillStyle = shadeRgb(theme, 0.32);
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < spots.length; i++) {
        const s = spots[i];
        const gx = s.x * size;
        const gy = s.y * size;
        const gr = s.r * size;
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        grad.addColorStop(0, shadeRgb(theme, s.bright));
        grad.addColorStop(0.6, shadeRgb(theme, s.mid));
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
    }
}

function buildProceduralTexture(theme, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const patternType = theme.patternType || "brick";
    const spots = PATTERN_SPOTS[patternType] || PATTERN_SPOTS.brick;
    drawSoftColorWash(ctx, size, theme, spots);
    applyTextureSoftening(ctx, size);
    return canvas;
}

export function getWallTextureCanvas(theme) {
    const key = themeKey(theme);
    if (!textureCache.has(key)) {
        textureCache.set(
            key,
            buildProceduralTexture(theme, wallTextureSettings.textureSize)
        );
    }
    return textureCache.get(key);
}

export async function loadWallTextureFromImage(url, theme) {
    const img = new Image();
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const imgCtx = canvas.getContext("2d");
    imgCtx.drawImage(img, 0, 0);
    applyTextureSoftening(imgCtx, canvas.width);
    textureCache.set(themeKey(theme), canvas);
    return canvas;
}

export function clearWallTextureCache() {
    textureCache.clear();
}
