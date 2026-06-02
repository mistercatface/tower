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

export function paintPixelArea(ctx, width, height, startWorldX, startWorldY, obstacleGrid, seed, hnav, options = {}) {
    const isWall = options.isWall || false;
    let dirX = 0, dirY = 0, foldX = 0, foldY = 0, pixelsPerUnit = 1;
    if (isWall && options.p1) {
        const edgeLen = Math.hypot(options.p2.x - options.p1.x, options.p2.y - options.p1.y);
        dirX = (options.p2.x - options.p1.x) / edgeLen;
        dirY = (options.p2.y - options.p1.y) / edgeLen;
        foldX = -dirY;
        foldY = dirX;
        pixelsPerUnit = options.pixelsPerUnit;
    }
    
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
        for (let x = 0; x < width; x++) {
            let evalX, evalY;
            if (isWall && options.p1) {
                const z = (height - 1 - y) / pixelsPerUnit;
                const dist = x / pixelsPerUnit;
                evalX = options.p1.x + dist * dirX + foldX * z;
                evalY = options.p1.y + dist * dirY + foldY * z;
            } else if (isWall) {
                evalX = startWorldX + x;
                evalY = startWorldY + (cellSize - y) + (options.zOffset || 0);
            } else {
                evalX = startWorldX + x;
                evalY = startWorldY + y;
            }
            
            // 1. Domain Warp
            const warpX = noise2D(evalX * scaleWarp, evalY * scaleWarp, 2) * warpAmp;
            const warpY = noise2D((evalX + 500) * scaleWarp, (evalY + 500) * scaleWarp, 2) * warpAmp;
            
            const lookupX = evalX + warpX;
            const lookupY = evalY + warpY;
            
            // 2. Obstacle Check (MUST use unwarped evalX/evalY so it aligns perfectly with 3D walls)
            const col = Math.floor((evalX - minX) / cellSize);
            const row = Math.floor((evalY - minY) / cellSize);
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
            
            // 3. Base Palette Cleanser Station Aesthetic
            // Base dark steel/metal color
            let r = 24, g = 26, b = 30;
            
            // Smooth large scale structure noise (replaces hard Voronoi banding)
            const structureNoise = noise2D(evalX * 0.005, evalY * 0.005, 2);
            r = clampByte(r + structureNoise * 6);
            g = clampByte(g + structureNoise * 6);
            b = clampByte(b + structureNoise * 8);
            
            // Fine grain metal texture
            const fineNoise = noise2D(evalX * 0.8, evalY * 0.8, 1) * 3;
            r = clampByte(r + fineNoise);
            g = clampByte(g + fineNoise);
            b = clampByte(b + fineNoise);

            // 4. Cellular / Perlin Circuitry Nerves Effect
            // We use domain-warped coordinates (lookupX, lookupY) to make the nerves organic and winding
            const nerveFreq1 = 0.03;
            const nerveNoise1 = Math.abs(noise2D(lookupX * nerveFreq1, lookupY * nerveFreq1, 2));
            if (nerveNoise1 < 0.05) {
                const intensity = (1.0 - nerveNoise1 / 0.05) * 16; 
                // Subtle cyan/blue circuitry glow
                r = clampByte(r + intensity * 0.5);
                g = clampByte(g + intensity * 1.5);
                b = clampByte(b + intensity * 2.0);
            }
            
            const nerveFreq2 = 0.05;
            const nerveNoise2 = Math.abs(noise2D((lookupX + 500) * nerveFreq2, (lookupY + 500) * nerveFreq2, 2));
            if (nerveNoise2 < 0.04) {
                const intensity = (1.0 - nerveNoise2 / 0.04) * 20; 
                // Subtle copper circuitry
                r = clampByte(r + intensity * 1.5);
                g = clampByte(g + intensity * 1.0);
                b = clampByte(b + intensity * 0.5);
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

export function paintWallFace(ctx, width, height, p1, p2, pixelsPerUnit, obstacleGrid, seed, hnav) {
    paintPixelArea(ctx, width, height, 0, 0, obstacleGrid, seed, hnav, {
        isWall: true,
        p1, p2, pixelsPerUnit
    });
}
