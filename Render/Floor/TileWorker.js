import {
    bakeFloorCellCanvas,
    bakeFloorChunkCanvas,
    bakeFloorTileTextureCanvas,
    bakeWallFaceCanvases,
    paintPixelArea
} from "./FloorTilePainter.js";

import { bakePixelsForWorldSpan } from "./floorTextureResolution.js";
import { getFloorProceduralProfile, registerRuntimeFloorProfile } from "../../Config/floorProceduralConfig.js";
import { withLabAnimationFrame } from "./FloorTilePainter.js";

self.onmessage = function (e) {
    const { id, type, payload } = e.data;
    if (!id || !type) return;

    try {
        let canvases = [];

        switch (type) {
            case "bakeFloorChunk":
                canvases = bakeFloorChunkCanvas(payload);
                break;
            case "bakeFloorCell":
                canvases = [bakeFloorCellCanvas(
                    payload.worldX,
                    payload.worldY,
                    payload.obstacleGrid,
                    payload.seed,
                    payload.profileId
                )];
                break;
            case "bakeWallFace":
                canvases = bakeWallFaceCanvases(
                    payload.width,
                    payload.height,
                    payload.p1,
                    payload.p2,
                    payload.pixelsPerUnit,
                    payload.obstacleGrid,
                    payload.seed,
                    payload.profileId
                );
                break;
            case "bakeTileTexture":
                canvases = [bakeFloorTileTextureCanvas(
                    payload.seed,
                    payload.cellSize,
                    payload.profileId
                )];
                break;
            
            // Lab specific endpoints
            case "labBakeFloorCell":
                canvases = [withLabAnimationFrame(payload.profileId, payload.frameIndex, (profileId) =>
                    bakeFloorCellCanvas(payload.worldX, payload.worldY, payload.obstacleGrid, payload.seed, profileId)
                )];
                break;
            case "labBakeWallCell":
                canvases = [withLabAnimationFrame(payload.profileId, payload.frameIndex, (profileId) => {
                    const bakeSize = bakePixelsForWorldSpan(payload.cellSize);
                    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
                    const ctx = canvas.getContext("2d");
                    ctx.imageSmoothingEnabled = false;
                    paintPixelArea(
                        ctx, bakeSize, bakeSize, payload.worldX, payload.worldY,
                        payload.obstacleGrid, payload.seed,
                        { isWall: true, zOffset: payload.storyRow * payload.cellSize },
                        profileId
                    );
                    return canvas;
                })];
                break;
            case "labBakeWallFace":
                canvases = [withLabAnimationFrame(payload.profileId, payload.frameIndex, (profileId) => {
                    const width = bakePixelsForWorldSpan(payload.cellSize);
                    const height = bakePixelsForWorldSpan(payload.cellSize * payload.storyCount);
                    const canvas = new OffscreenCanvas(width, height);
                    const ctx = canvas.getContext("2d");
                    ctx.imageSmoothingEnabled = false;
                    paintPixelArea(
                        ctx, width, height, 0, 0,
                        payload.obstacleGrid, payload.seed,
                        { isWall: true, p1: { x: 0, y: 0 }, p2: { x: payload.cellSize, y: 0 }, pixelsPerUnit: payload.pixelsPerUnit },
                        profileId
                    );
                    return canvas;
                })];
                break;
            case "registerRuntimeProfile":
                registerRuntimeFloorProfile(payload.profileId, payload.profile);
                canvases = [];
                break;
            default:
                throw new Error(`Unknown TileWorker request type: ${type}`);
        }

        const bitmaps = canvases.map(c => c.transferToImageBitmap());
        self.postMessage({ id, bitmaps }, bitmaps);

    } catch (err) {
        console.error("TileWorker Error:", err);
        self.postMessage({ id, error: err.message });
    }
};
