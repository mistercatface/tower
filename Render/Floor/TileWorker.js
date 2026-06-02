import { bakeFloorChunkCanvases, bakeWallFaceCanvases } from "./FloorTilePainter.js";
import { registerRuntimeFloorProfile } from "../../Config/floorProceduralConfig.js";
import { invalidateProfileScratch } from "./ProfileBakeResolver.js";

const HANDLERS = {
    bakeFloorChunk(payload) {
        return bakeFloorChunkCanvases(payload);
    },

    bakeWallFace(payload) {
        return bakeWallFaceCanvases(payload.width, payload.height, payload.p1, payload.p2, payload.pixelsPerUnit, payload.seed, payload.profileId, payload);
    },

    registerRuntimeProfile(payload) {
        registerRuntimeFloorProfile(payload.profileId, payload.profile);
        invalidateProfileScratch(payload.profileId);
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
