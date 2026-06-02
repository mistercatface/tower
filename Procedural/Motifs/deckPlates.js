import { clampByte } from "../util/color.js";
import { noise2D } from "../Noise/Perlin2D.js";

function plateMetrics(sample, config) {
    const cell = config.cellWorldSize;
    const plateW = cell * (config.plateCells ?? 2);
    const plateH = cell * (config.plateRows ?? config.plateCells ?? 2);
    const plateCol = Math.floor(sample.evalX / plateW);
    const plateRow = Math.floor(sample.evalY / plateH);
    const localX = sample.evalX - plateCol * plateW;
    const localY = sample.evalY - plateRow * plateH;
    const u = localX / plateW;
    const v = localY / plateH;
    const edgeDist = Math.min(u, 1 - u, v, 1 - v);
    return { plateCol, plateRow, localX, localY, plateW, plateH, u, v, edgeDist };
}

function applyGrout(rgb, edgeDist, config) {
    const groutW = config.groutWidth ?? 0.05;
    if (edgeDist >= groutW) {
        return;
    }
    const t = (1 - edgeDist / groutW) * (config.groutPeak ?? 10);
    const tint = config.groutTint ?? [-5, -5, -4];
    rgb.r = clampByte(rgb.r + t * tint[0]);
    rgb.g = clampByte(rgb.g + t * tint[1]);
    rgb.b = clampByte(rgb.b + t * tint[2]);
}

function applyPlateFill(rgb, plateCol, plateRow, config) {
    const [jx, jy] = config.jitterOffset ?? [0, 0];
    const jitter = noise2D(plateCol * 0.71 + jx, plateRow * 0.53 + jy, 1);
    const delta = jitter * (config.plateVariation ?? 3);
    rgb.r = clampByte(rgb.r + delta);
    rgb.g = clampByte(rgb.g + delta * 0.95);
    rgb.b = clampByte(rgb.b + delta * 1.05);
}

function applyRivets(rgb, localX, localY, plateW, plateH, config) {
    const spacing = config.rivetSpacing;
    if (!spacing || spacing <= 0) {
        return;
    }
    const inset = config.rivetInset ?? spacing * 0.5;
    const radius = config.rivetRadius ?? 0.02;
    const peak = config.rivetPeak ?? 5;
    const tint = config.rivetTint ?? [2, 3, 4];

    const nx = ((localX - inset) % spacing + spacing) % spacing;
    const ny = ((localY - inset) % spacing + spacing) % spacing;
    const nearX = nx < radius * spacing || nx > spacing - radius * spacing;
    const nearY = ny < radius * spacing || ny > spacing - radius * spacing;
    if (!nearX || !nearY) {
        return;
    }
    const dx = Math.min(nx, spacing - nx) / (radius * spacing);
    const dy = Math.min(ny, spacing - ny) / (radius * spacing);
    const t = (1 - Math.max(dx, dy)) * peak;
    rgb.r = clampByte(rgb.r + t * tint[0]);
    rgb.g = clampByte(rgb.g + t * tint[1]);
    rgb.b = clampByte(rgb.b + t * tint[2]);
}

/** World-aligned deck plates (grout, fill jitter, optional rivets). */
export const deckPlatesMotif = {
    apply(sample, rgb, config) {
        const { plateCol, plateRow, localX, localY, plateW, plateH, edgeDist } = plateMetrics(sample, config);
        applyPlateFill(rgb, plateCol, plateRow, config);
        applyGrout(rgb, edgeDist, config);
        applyRivets(rgb, localX, localY, plateW, plateH, config);
    },
};
