import { bakeFloorCellCanvas, bakeFloorChunkCanvas, bakeFloorChunkFrameCanvas, bakeFloorTileTextureCanvas, bakeWallFaceCanvases, bakeWallCellCanvas, bakeWallFaceCanvas, withLabAnimationFrame } from "./FloorTilePainter.js";

import { bakePixelsForWorldSpan } from "./floorTextureResolution.js";
import { registerRuntimeFloorProfile } from "../../Config/floorProceduralConfig.js";

const HANDLERS = {
    bakeFloorChunk(payload) {
        return bakeFloorChunkCanvas(payload);
    },

    bakeFloorChunkFrame(payload) {
        return [bakeFloorChunkFrameCanvas(payload)];
    },

    bakeFloorCell(payload) {
        return [bakeFloorCellCanvas(payload.worldX, payload.worldY, payload.seed, payload.profileId)];
    },

    bakeWallFace(payload) {
        return bakeWallFaceCanvases(payload.width, payload.height, payload.p1, payload.p2, payload.pixelsPerUnit, payload.seed, payload.profileId);
    },

    bakeTileTexture(payload) {
        return [bakeFloorTileTextureCanvas(payload.seed, payload.profileId)];
    },

    // Lab specific endpoints
    labBakeFloorCell(payload) {
        return [withLabAnimationFrame(payload.profileId, payload.frameIndex, (profileId) => bakeFloorCellCanvas(payload.worldX, payload.worldY, payload.seed, profileId))];
    },

    labBakeWallCell(payload) {
        return [withLabAnimationFrame(payload.profileId, payload.frameIndex, (profileId) => bakeWallCellCanvas(payload.worldX, payload.worldY, payload.storyRow, payload.seed, profileId))];
    },

    labBakeWallFace(payload) {
        return [
            withLabAnimationFrame(payload.profileId, payload.frameIndex, (profileId) => {
                const width = bakePixelsForWorldSpan(payload.cellSize);
                const height = bakePixelsForWorldSpan(payload.cellSize * payload.storyCount);
                return bakeWallFaceCanvas(width, height, { x: 0, y: 0 }, { x: payload.cellSize, y: 0 }, payload.pixelsPerUnit, payload.seed, profileId);
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
        if (!handler) {
            throw new Error(`Unknown TileWorker request type: ${type}`);
        }

        const canvases = handler(payload);

        const bitmaps = canvases.map((c) => c.transferToImageBitmap());
        self.postMessage({ id, bitmaps }, bitmaps);
    } catch (err) {
        console.error("TileWorker Error:", err);
        self.postMessage({ id, error: err.message });
    }
};
