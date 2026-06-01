import { combatVisualSettings, floorTileSettings, gridSettings } from "../../Config/Config.js";
import { colRowToIndex } from "../../Spatial/Grid/GridUtils.js";

function hashTileSeed(seed, worldX, worldY) {
    const wx = Math.floor(worldX);
    const wy = Math.floor(worldY);
    let h = (seed ^ Math.imul(wx, 374761393)) >>> 0;
    h = (h ^ Math.imul(wy, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
}

function parseHexColor(hex) {
    const value = hex.startsWith("#") ? hex.slice(1) : hex;
    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
    };
}

function clampByte(value) {
    return Math.max(0, Math.min(255, value));
}

function mixChannel(base, delta) {
    return clampByte(base + delta);
}

function rgbString(r, g, b) {
    return `rgb(${r}, ${g}, ${b})`;
}

function panelTone(hash, panelParity) {
    const base = parseHexColor(combatVisualSettings.floorFill);
    const alt = parseHexColor(combatVisualSettings.floorHighlight);
    const pick = panelParity ^ (hash & 1);
    const source = pick ? alt : base;
    const tone = (hash & 0xff) / 255;
    const delta = Math.floor((tone - 0.5) * 24);
    return rgbString(
        mixChannel(source.r, delta),
        mixChannel(source.g, delta),
        mixChannel(source.b, delta),
    );
}

function paintCell(ctx, localX, localY, cellSize, hash, blocked, worldX, worldY, { wallSurface = false } = {}) {
    const panelCol = Math.floor(worldX / (cellSize * 2));
    const panelRow = Math.floor(worldY / (cellSize * 2));
    const panelParity = (panelCol + panelRow) & 1;

    if (blocked && !wallSurface) {
        const shadow = parseHexColor(combatVisualSettings.floorShadow);
        ctx.fillStyle = rgbString(shadow.r, shadow.g, shadow.b);
    } else {
        ctx.fillStyle = panelTone(hash, panelParity);
    }
    ctx.fillRect(localX, localY, cellSize, cellSize);

    if (blocked && !wallSurface) return;

    const seam = parseHexColor(combatVisualSettings.gridStroke.startsWith("rgba") ? "#5a697d" : combatVisualSettings.gridStroke);
    ctx.fillStyle = `rgba(${seam.r}, ${seam.g}, ${seam.b}, 0.55)`;
    ctx.fillRect(localX, localY, cellSize, 1);
    ctx.fillRect(localX, localY, 1, cellSize);

    if (localX === 0 || localY === 0) {
        ctx.fillStyle = `rgba(${seam.r}, ${seam.g}, ${seam.b}, 0.85)`;
        if (localX === 0) ctx.fillRect(localX, localY, 1, cellSize);
        if (localY === 0) ctx.fillRect(localX, localY, cellSize, 1);
    }

    if ((hash & 0xf) === 0) {
        ctx.fillStyle = "rgba(180, 190, 205, 0.18)";
        ctx.fillRect(localX + 3 + (hash & 3), localY + 3 + ((hash >> 2) & 3), 3, 2);
    }

    if ((hash & 0x3f) === 0) {
        ctx.fillStyle = "rgba(90, 105, 125, 0.35)";
        ctx.fillRect(localX + cellSize - 4, localY + 4, 2, 2);
        ctx.fillRect(localX + 4, localY + cellSize - 4, 2, 2);
    }
}

export function bakeFloorTileTextureCanvas(seed, cellSize = gridSettings.cellSize) {
    const canvas = document.createElement("canvas");
    canvas.width = cellSize;
    canvas.height = cellSize;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const hash = hashTileSeed(seed, 0, 0);
    paintCell(ctx, 0, 0, cellSize, hash, false, 0, 0, { wallSurface: true });
    return canvas;
}

export function bakeFloorChunkCanvas({
    chunkCol,
    chunkRow,
    obstacleGrid,
    seed,
    cellsPerChunk = floorTileSettings.cellsPerChunk,
}) {
    const cellSize = obstacleGrid.cellSize;
    const chunkSizePx = cellSize * cellsPerChunk;
    const canvas = document.createElement("canvas");
    canvas.width = chunkSizePx;
    canvas.height = chunkSizePx;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    const startCol = chunkCol * cellsPerChunk;
    const startRow = chunkRow * cellsPerChunk;
    const chunkWorldX = obstacleGrid.minX + startCol * cellSize;
    const chunkWorldY = obstacleGrid.minY + startRow * cellSize;
    const { cols, rows, grid } = obstacleGrid;

    ctx.fillStyle = combatVisualSettings.floorShadow;
    ctx.fillRect(0, 0, chunkSizePx, chunkSizePx);

    for (let localRow = 0; localRow < cellsPerChunk; localRow++) {
        for (let localCol = 0; localCol < cellsPerChunk; localCol++) {
            const worldX = chunkWorldX + localCol * cellSize;
            const worldY = chunkWorldY + localRow * cellSize;
            const col = startCol + localCol;
            const row = startRow + localRow;
            const inGrid = col >= 0 && row >= 0 && col < cols && row < rows;
            const blocked = inGrid && grid[colRowToIndex(col, row, cols)] === 1;
            const hash = hashTileSeed(seed, worldX, worldY);
            paintCell(
                ctx,
                localCol * cellSize,
                localRow * cellSize,
                cellSize,
                hash,
                blocked,
                worldX,
                worldY,
            );
        }
    }

    return canvas;
}
