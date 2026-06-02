import { floorTileSettings, gridSettings } from "../../Config/Config.js";
import {
    defaultFloorProceduralProfileId,
    getFloorProceduralProfile,
} from "../../Config/floorProceduralConfig.js";
import { createPaintContext, composeFloorPixel } from "../../Procedural/FloorTextureComposer.js";
import {
    createWallFaceAxes,
    mapPixelToEval,
    queryObstacleBlocked,
} from "./SurfaceCoordinateMapper.js";
import {
    bakePixelsForWorldSpan,
    drawBakedTexture,
    getTexturePixelsPerWorldUnit,
} from "./floorTextureResolution.js";

export function paintPixelArea(
    ctx,
    width,
    height,
    startWorldX,
    startWorldY,
    obstacleGrid,
    seed,
    options = {},
    profileId
) {
    const profile = getFloorProceduralProfile(profileId ?? defaultFloorProceduralProfileId);
    const paintContext = createPaintContext(profile, seed);

    const isWall = options.isWall === true;
    const cellSize = obstacleGrid.cellSize;
    const texturePixelsPerWorldUnit = options.texturePixelsPerWorldUnit ?? getTexturePixelsPerWorldUnit();

    let surfaceKind = "floor";
    let wallFace = null;
    let pixelsPerUnit = texturePixelsPerWorldUnit;
    let zOffset = 0;

    if (isWall && options.p1 && options.p2) {
        surfaceKind = "wallFace";
        const edgeLen = Math.hypot(options.p2.x - options.p1.x, options.p2.y - options.p1.y);
        const axes = createWallFaceAxes(options.p1, options.p2);
        wallFace = { p1: options.p1, edgeLen, ...axes };
        pixelsPerUnit = options.pixelsPerUnit;
    } else if (isWall) {
        surfaceKind = "wallCell";
        zOffset = options.zOffset ?? 0;
    }

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    let idx = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const mapped = mapPixelToEval({
                x,
                y,
                startWorldX,
                startWorldY,
                cellSize,
                surfaceKind,
                height,
                width,
                pixelsPerUnit,
                texturePixelsPerWorldUnit,
                bakeWidth: width,
                zOffset,
                wallFace,
            });

            const blocked = queryObstacleBlocked(mapped.evalX, mapped.evalY, obstacleGrid);
            const rgb = composeFloorPixel(
                {
                    evalX: mapped.evalX,
                    evalY: mapped.evalY,
                    wallU: mapped.wallU,
                    wallV: mapped.wallV,
                    blocked,
                    isWall,
                    surfaceKind,
                },
                paintContext
            );

            data[idx++] = rgb.r;
            data[idx++] = rgb.g;
            data[idx++] = rgb.b;
            data[idx++] = 255;
        }
    }

    ctx.putImageData(imgData, 0, 0);
}

export function bakeFloorCellCanvas(worldX, worldY, obstacleGrid, seed, profileId) {
    const cellSize = obstacleGrid.cellSize;
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, bakeSize, bakeSize, worldX, worldY, obstacleGrid, seed, {}, profileId);
    return canvas;
}

export function drawWallCell(ctx, destX, destY, storyRow, obstacleGrid, seed, profileId) {
    const cellSize = obstacleGrid.cellSize;
    const bakeSize = bakePixelsForWorldSpan(cellSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const bakeCtx = canvas.getContext("2d");
    bakeCtx.imageSmoothingEnabled = false;
    paintPixelArea(bakeCtx, bakeSize, bakeSize, destX, destY, obstacleGrid, seed, {
        isWall: true,
        zOffset: storyRow * cellSize,
    }, profileId);
    drawBakedTexture(ctx, canvas, destX, destY, cellSize, cellSize);
}

export function bakeFloorTileTextureCanvas(seed, cellSize = gridSettings.cellSize, profileId) {
    const stubGrid = {
        cellSize,
        minX: 0,
        minY: 0,
        cols: 1,
        rows: 1,
        grid: new Uint8Array(1),
    };
    return bakeFloorCellCanvas(0, 0, stubGrid, seed, profileId);
}

export function bakeFloorChunkCanvas({
    chunkCol,
    chunkRow,
    obstacleGrid,
    seed,
    cellsPerChunk = floorTileSettings.cellsPerChunk,
    profileId,
}) {
    const cellSize = obstacleGrid.cellSize;
    const chunkWorldSize = cellSize * cellsPerChunk;
    const bakeSize = bakePixelsForWorldSpan(chunkWorldSize);
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    const startCol = chunkCol * cellsPerChunk;
    const startRow = chunkRow * cellsPerChunk;
    const chunkWorldX = obstacleGrid.minX + startCol * cellSize;
    const chunkWorldY = obstacleGrid.minY + startRow * cellSize;

    paintPixelArea(ctx, bakeSize, bakeSize, chunkWorldX, chunkWorldY, obstacleGrid, seed, {}, profileId);

    return canvas;
}

export function paintWallFace(ctx, width, height, p1, p2, pixelsPerUnit, obstacleGrid, seed, profileId) {
    paintPixelArea(ctx, width, height, 0, 0, obstacleGrid, seed, {
        isWall: true,
        p1,
        p2,
        pixelsPerUnit,
    }, profileId);
}
