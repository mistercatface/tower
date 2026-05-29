import { wallTextureSettings } from "../../Config/Config.js";

const textureCache = new Map();

function themeKey(theme) {
    return `${theme.r},${theme.g},${theme.b}`;
}

function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function shadeRgb(theme, amount) {
    return `rgb(${clampByte(theme.r * amount)}, ${clampByte(theme.g * amount)}, ${clampByte(theme.b * amount)})`;
}

function buildProceduralTexture(theme, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const mortar = shadeRgb(theme, 0.35);
    const brickLight = shadeRgb(theme, 1.08);
    const brickMid = shadeRgb(theme, 0.82);
    const brickDark = shadeRgb(theme, 0.62);
    const grout = "rgba(0, 0, 0, 0.22)";

    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, size, size);

    const mortarX = Math.max(2, Math.round(size * 0.06));
    const mortarY = Math.max(2, Math.round(size * 0.08));
    const rowH = Math.floor((size - mortarY) / 3);
    const cols = 2;

    for (let row = 0; row < 3; row++) {
        const y = row * (rowH + mortarY);
        const offset = row % 2 === 0 ? 0 : Math.round(size / (cols * 2));
        const brickW = Math.floor((size - mortarX * (cols + 1)) / cols);

        for (let col = 0; col < cols; col++) {
            const x = mortarX + col * (brickW + mortarX) + offset;
            if (x + brickW > size) continue;

            const tone = (row + col) % 3;
            ctx.fillStyle = tone === 0 ? brickLight : tone === 1 ? brickMid : brickDark;
            ctx.fillRect(x, y, brickW, rowH);

            ctx.strokeStyle = grout;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, brickW - 1, rowH - 1);
        }
    }

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
    canvas.getContext("2d").drawImage(img, 0, 0);
    textureCache.set(themeKey(theme), canvas);
    return canvas;
}

export function clearWallTextureCache() {
    textureCache.clear();
}
