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

export function paintPixelArea(
    ctx,
    width,
    height,
    startWorldX,
    startWorldY,
    obstacleGrid,
    seed,
    options = {},
    profileId = defaultFloorProceduralProfileId
) {
    const profile = getFloorProceduralProfile(profileId);
    const paintContext = createPaintContext(profile, seed);

    const isWall = options.isWall === true;
    const cellSize = obstacleGrid.cellSize;

    let surfaceKind = "floor";
    let wallFace = null;
    let pixelsPerUnit = 1;
    let zOffset = 0;

    if (isWall && options.p1 && options.p2) {
        surfaceKind = "wallFace";
        const axes = createWallFaceAxes(options.p1, options.p2);
        wallFace = { p1: options.p1, ...axes };
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
            const { evalX, evalY } = mapPixelToEval({
                x,
                y,
                startWorldX,
                startWorldY,
                cellSize,
                surfaceKind,
                height,
                pixelsPerUnit,
                zOffset,
                wallFace,
            });

            const blocked = queryObstacleBlocked(evalX, evalY, obstacleGrid);
            const rgb = composeFloorPixel({ evalX, evalY, blocked, isWall }, paintContext);

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
    const canvas = new OffscreenCanvas(cellSize, cellSize);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    paintPixelArea(ctx, cellSize, cellSize, worldX, worldY, obstacleGrid, seed, {}, profileId);
    return canvas;
}

export function drawWallCell(ctx, worldX, worldY, storyRow, obstacleGrid, seed, profileId) {
    const cellSize = obstacleGrid.cellSize;
    paintPixelArea(ctx, cellSize, cellSize, worldX, worldY, obstacleGrid, seed, {
        isWall: true,
        zOffset: storyRow * cellSize,
    }, profileId);
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
    const chunkSizePx = cellSize * cellsPerChunk;
    const canvas = new OffscreenCanvas(chunkSizePx, chunkSizePx);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    const startCol = chunkCol * cellsPerChunk;
    const startRow = chunkRow * cellsPerChunk;
    const chunkWorldX = obstacleGrid.minX + startCol * cellSize;
    const chunkWorldY = obstacleGrid.minY + startRow * cellSize;

    paintPixelArea(ctx, chunkSizePx, chunkSizePx, chunkWorldX, chunkWorldY, obstacleGrid, seed, {}, profileId);

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
