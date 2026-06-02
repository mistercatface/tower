import { combatVisualSettings, floorTileSettings, gridSettings, voronoiFloorSettings } from "../../Config/Config.js";

// Fast, seedable LCG generator for noise table
function lcg(seed) {
    let s = seed;
    return function() {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
}

const NOISE_SIZE = 256;
const NOISE_MASK = NOISE_SIZE - 1;
const noiseTable = new Float32Array(NOISE_SIZE * NOISE_SIZE);
let currentNoiseSeed = null;

export function initNoiseTable(seed) {
    const rand = lcg(seed || 12345);
    for (let i = 0; i < noiseTable.length; i++) {
        noiseTable[i] = rand() * 2 - 1;
    }
}

function ensureNoiseInitialized(seed) {
    if (currentNoiseSeed !== seed) {
        initNoiseTable(seed);
        currentNoiseSeed = seed;
    }
}

function rawNoise2D(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    
    // Hermite interpolation (smoothstep)
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    
    const x0 = xi & NOISE_MASK;
    const x1 = (xi + 1) & NOISE_MASK;
    const y0 = (yi & NOISE_MASK) * NOISE_SIZE;
    const y1 = ((yi + 1) & NOISE_MASK) * NOISE_SIZE;
    
    const n00 = noiseTable[x0 + y0];
    const n10 = noiseTable[x1 + y0];
    const n01 = noiseTable[x0 + y1];
    const n11 = noiseTable[x1 + y1];
    
    const ix0 = n00 + u * (n10 - n00);
    const ix1 = n01 + u * (n11 - n01);
    
    return ix0 + v * (ix1 - ix0);
}

export function noise2D(x, y, octaves = 2) {
    let value = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
        value += rawNoise2D(x * frequency, y * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return value / maxValue;
}

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
    return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
}

function clampByte(value) {
    return Math.max(0, Math.min(255, value));
}

function mixChannel(base, delta) {
    return clampByte(base + delta);
}

function getNodeAt(col, row, cols, rows, hnav, isWall) {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
    let node = hnav.cellToNode[row * cols + col];
    if (!node && isWall) {
        for (let r = 1; r <= 3; r++) {
            for (let dr = -r; dr <= r; dr++) {
                for (let dc = -r; dc <= r; dc++) {
                    const nc = col + dc;
                    const nr = row + dr;
                    if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                        const n = hnav.cellToNode[nr * cols + nc];
                        if (n) return n;
                    }
                }
            }
        }
    }
    return node;
}

export function paintPixelArea(ctx, width, height, startWorldX, startWorldY, obstacleGrid, seed, hnav, options = {}) {
    const isWall = options.isWall || false;
    const zOffset = options.zOffset || 0;
    
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    
    const minX = obstacleGrid.minX;
    const minY = obstacleGrid.minY;
    const cols = obstacleGrid.cols;
    const rows = obstacleGrid.rows;
    const cellSize = obstacleGrid.cellSize;
    
    const baseColor = parseHexColor(combatVisualSettings.floorFill);
    const highlightColor = parseHexColor(combatVisualSettings.floorHighlight);
    const shadowColor = parseHexColor(combatVisualSettings.floorShadow);
    
    const scaleWarp = voronoiFloorSettings.warpFrequency;
    const warpAmp = voronoiFloorSettings.warpAmplitude;
    const biomeScale = voronoiFloorSettings.biomeFrequency;
    const stoneNoiseFreq = voronoiFloorSettings.stoneNoiseFreq;
    const seamWidth = voronoiFloorSettings.seamWidth;
    
    ensureNoiseInitialized(seed);
    
    let idx = 0;
    for (let y = 0; y < height; y++) {
        let evalY = startWorldY + y;
        if (isWall) {
            evalY = startWorldY + (cellSize - y) + zOffset;
        }
        for (let x = 0; x < width; x++) {
            let evalX = startWorldX + x;
            
            // 1. Domain Warp
            const warpX = noise2D(evalX * scaleWarp, evalY * scaleWarp, 2) * warpAmp;
            const warpY = noise2D((evalX + 500) * scaleWarp, (evalY + 500) * scaleWarp, 2) * warpAmp;
            
            const lookupX = evalX + warpX;
            const lookupY = evalY + warpY;
            
            // 2. Grid Index
            const col = Math.floor((lookupX - minX) / cellSize);
            const row = Math.floor((lookupY - minY) / cellSize);
            const inGrid = col >= 0 && row >= 0 && col < cols && row < rows;
            const cellIdx = inGrid ? row * cols + col : -1;
            const blocked = inGrid && obstacleGrid.grid[cellIdx] === 1;
            
            if (blocked && !isWall) {
                data[idx++] = shadowColor.r;
                data[idx++] = shadowColor.g;
                data[idx++] = shadowColor.b;
                data[idx++] = 255;
                continue;
            }
            
            const node = getNodeAt(col, row, cols, rows, hnav, isWall);
            
            if (!node) {
                data[idx++] = baseColor.r;
                data[idx++] = baseColor.g;
                data[idx++] = baseColor.b;
                data[idx++] = 255;
                continue;
            }
            
            // 3. Biome Selection
            const nodeHash = hashTileSeed(seed, node.col, node.row);
            const biomeNoise = noise2D(node.x * biomeScale, node.y * biomeScale, 2);
            let biome = 0;
            if (biomeNoise < -0.35) {
                biome = 2; // Magma
            } else if (biomeNoise > 0.35) {
                biome = 1; // Mossy
            } else {
                if ((nodeHash & 0xff) < 55) {
                    biome = 3; // Energy
                } else {
                    biome = 0; // Pristine
                }
            }
            
            // 4. Base Color and Texture
            let r = 0, g = 0, b = 0;
            const nodeTone = ((nodeHash & 0xff) / 255 - 0.5) * 16;
            
            if (biome === 0) { // Pristine Slate
                const pick = (nodeHash & 1);
                const c = pick ? highlightColor : baseColor;
                r = mixChannel(c.r, nodeTone);
                g = mixChannel(c.g, nodeTone);
                b = mixChannel(c.b, nodeTone);
                
                const n = noise2D(evalX * stoneNoiseFreq, evalY * stoneNoiseFreq, 1) * 6;
                r = mixChannel(r, n);
                g = mixChannel(g, n);
                b = mixChannel(b, n);
            } else if (biome === 1) { // Mossy Ruins
                const pick = (nodeHash & 1);
                const c = pick ? highlightColor : baseColor;
                r = mixChannel(c.r, nodeTone - 10);
                g = mixChannel(c.g, nodeTone + 8);
                b = mixChannel(c.b, nodeTone - 8);
                
                const n = noise2D(evalX * stoneNoiseFreq, evalY * stoneNoiseFreq, 1) * 6;
                r = mixChannel(r, n);
                g = mixChannel(g, n);
                b = mixChannel(b, n);
                
                const mossNoise = noise2D(evalX * 0.05, evalY * 0.05, 2);
                if (mossNoise > 0.0) {
                    const mossFactor = Math.min(1.0, mossNoise * 2.0);
                    const mr = Math.floor(45 + (nodeHash & 7));
                    const mg = Math.floor(75 + ((nodeHash >> 3) & 15));
                    const mb = Math.floor(35 + ((nodeHash >> 7) & 7));
                    r = Math.floor(r + (mr - r) * mossFactor);
                    g = Math.floor(g + (mg - g) * mossFactor);
                    b = Math.floor(b + (mb - b) * mossFactor);
                }
            } else if (biome === 2) { // Cracked Magma
                r = mixChannel(shadowColor.r, -4);
                g = mixChannel(shadowColor.g, -4);
                b = mixChannel(shadowColor.b, -4);
                
                const crackVal = Math.abs(noise2D(evalX * 0.08, evalY * 0.08, 2));
                if (crackVal < 0.12) {
                    const intensity = (1.0 - crackVal / 0.12) * 255;
                    r = clampByte(r + intensity);
                    g = clampByte(g + intensity * 0.4);
                    b = clampByte(b + intensity * 0.1);
                }
            } else if (biome === 3) { // Energy Conduits
                r = mixChannel(baseColor.r, -6);
                g = mixChannel(baseColor.g, -2);
                b = mixChannel(baseColor.b, 6);
                
                const detailNoise = noise2D(evalX * 0.25, evalY * 0.25, 1);
                if (detailNoise > 0.5) {
                    r = mixChannel(r, 8);
                    g = mixChannel(g, 12);
                    b = mixChannel(b, 16);
                }
            }
            
            // 5. Seams / Boundaries check
            const nX_col = Math.floor((lookupX + seamWidth - minX) / cellSize);
            const nX_row = Math.floor((lookupY - minY) / cellSize);
            const nY_col = Math.floor((lookupX - minX) / cellSize);
            const nY_row = Math.floor((lookupY + seamWidth - minY) / cellSize);
            
            const nodeX = getNodeAt(nX_col, nX_row, cols, rows, hnav, isWall);
            const nodeY = getNodeAt(nY_col, nY_row, cols, rows, hnav, isWall);
            
            const isSeam = (nodeX !== node || nodeY !== node);
            
            if (isSeam) {
                const seamHash = hashTileSeed(seed, Math.floor(evalX), Math.floor(evalY));
                if (biome === 0) { // Pristine
                    r = Math.floor(shadowColor.r * 0.7);
                    g = Math.floor(shadowColor.g * 0.7);
                    b = Math.floor(shadowColor.b * 0.7);
                } else if (biome === 1) { // Mossy
                    r = Math.floor(shadowColor.r * 0.6);
                    g = Math.floor(shadowColor.g * 0.8);
                    b = Math.floor(shadowColor.b * 0.6);
                } else if (biome === 2) { // Magma
                    r = 255;
                    g = 60 + (seamHash % 60);
                    b = 0;
                } else if (biome === 3) { // Energy
                    r = 0;
                    g = 200 + (seamHash % 55);
                    b = 255;
                }
            }
            
            data[idx++] = r;
            data[idx++] = g;
            data[idx++] = b;
            data[idx++] = 255;
        }
    }
    
    ctx.putImageData(imgData, 0, 0);
}

export function bakeFloorCellCanvas(worldX, worldY, obstacleGrid, seed, hnav) {
    const cellSize = obstacleGrid.cellSize;
    const canvas = new OffscreenCanvas(cellSize, cellSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, cellSize, cellSize, worldX, worldY, obstacleGrid, seed, hnav);
    return canvas;
}

export function drawWallCell(ctx, worldX, worldY, storyRow, obstacleGrid, seed, hnav) {
    const cellSize = obstacleGrid.cellSize;
    paintPixelArea(ctx, cellSize, cellSize, worldX, worldY, obstacleGrid, seed, hnav, {
        isWall: true,
        zOffset: storyRow * cellSize
    });
}

export function bakeFloorTileTextureCanvas(seed, cellSize = gridSettings.cellSize, hnav) {
    return bakeFloorCellCanvas(0, 0, { cellSize, minX: 0, minY: 0, cols: 1, rows: 1, grid: new Uint8Array(1) }, seed, hnav);
}

export function bakeFloorChunkCanvas({ chunkCol, chunkRow, obstacleGrid, seed, hnav, cellsPerChunk = floorTileSettings.cellsPerChunk }) {
    const cellSize = obstacleGrid.cellSize;
    const chunkSizePx = cellSize * cellsPerChunk;
    const canvas = new OffscreenCanvas(chunkSizePx, chunkSizePx);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    const startCol = chunkCol * cellsPerChunk;
    const startRow = chunkRow * cellsPerChunk;
    const chunkWorldX = obstacleGrid.minX + startCol * cellSize;
    const chunkWorldY = obstacleGrid.minY + startRow * cellSize;

    paintPixelArea(ctx, chunkSizePx, chunkSizePx, chunkWorldX, chunkWorldY, obstacleGrid, seed, hnav);

    return canvas;
}
