import { bakeFloorCellCanvas, bakeFloorChunkCanvas, bakeFloorTileTextureCanvas, bakeWallFaceCanvases, bakeWallCellCanvas, bakeWallFaceCanvas, withLabAnimationFrame } from "./FloorTilePainter.js";

import { bakePixelsForWorldSpan } from "./floorTextureResolution.js";
import { registerRuntimeFloorProfile } from "../../Config/floorProceduralConfig.js";

let cachedObstacleGrid = null;

const HANDLERS = {
    setObstacleGrid(payload) {
        cachedObstacleGrid = payload;
        return [];
    },

    bakeFloorChunk(payload, grid) {
        return bakeFloorChunkCanvas({ ...payload, obstacleGrid: grid });
    },

    bakeFloorCell(payload, grid) {
        return [bakeFloorCellCanvas(payload.worldX, payload.worldY, grid, payload.seed, payload.profileId)];
    },

    bakeWallFace(payload, grid) {
        return bakeWallFaceCanvases(payload.width, payload.height, payload.p1, payload.p2, payload.pixelsPerUnit, grid, payload.seed, payload.profileId);
    },

    bakeTileTexture(payload) {
        return [bakeFloorTileTextureCanvas(payload.seed, payload.cellSize, payload.profileId)];
    },

    labBakeFloorCell(payload, grid) {
        return [withLabAnimationFrame(payload.profileId, payload.frameIndex, (profileId) => bakeFloorCellCanvas(payload.worldX, payload.worldY, grid, payload.seed, profileId))];
    },

    labBakeWallCell(payload, grid) {
        return [withLabAnimationFrame(payload.profileId, payload.frameIndex, (profileId) => bakeWallCellCanvas(payload.worldX, payload.worldY, payload.storyRow, grid, payload.seed, profileId))];
    },

    labBakeWallFace(payload, grid) {
        return [
            withLabAnimationFrame(payload.profileId, payload.frameIndex, (profileId) => {
                const width = bakePixelsForWorldSpan(payload.cellSize);
                const height = bakePixelsForWorldSpan(payload.cellSize * payload.storyCount);
                return bakeWallFaceCanvas(width, height, { x: 0, y: 0 }, { x: payload.cellSize, y: 0 }, payload.pixelsPerUnit, grid, payload.seed, profileId);
            }),
        ];
    },

    registerRuntimeProfile(payload) {
        registerRuntimeFloorProfile(payload.profileId, payload.profile);
        return [];
    },
};

self.onmessage = function (e) {
    const { id, type, payload } = e.data;
    if (!id || !type) return;
    try {
        const handler = HANDLERS[type];
        if (!handler)  throw new Error(`Unknown TileWorker request type: ${type}`);
        const grid = payload?.obstacleGrid || cachedObstacleGrid;
        const canvases = handler(payload, grid);
        const bitmaps = canvases.map((c) => c.transferToImageBitmap());
        self.postMessage({ id, bitmaps }, bitmaps);
    } catch (err) {
        console.error("TileWorker Error:", err);
        self.postMessage({ id, error: err.message });
    }
};
