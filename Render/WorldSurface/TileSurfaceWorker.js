import { registerRuntimeSurfaceProfile } from "../../Config/procedural/profiles.js";
import { bakeGroundChunkCanvases, bakeWallAtlasCanvases, BakeSession, installTileWorkerBakeConstants } from "../../Libraries/WorldSurface/worldSurface.js";
import { TILE_WORKER_MESSAGE } from "../../Libraries/WorldSurface/worldSurface.js";
export class TileSurfaceWorker {
    constructor() {
        this.bakeSession = new BakeSession();
        this.handlers = {
            [TILE_WORKER_MESSAGE.CONFIGURE_BAKE_CONSTANTS]: (payload) => this.configureBakeConstants(payload),
            [TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK]: (payload) => this.bakeGroundChunk(payload),
            [TILE_WORKER_MESSAGE.BAKE_WALL_ATLAS]: (payload) => this.bakeWallAtlas(payload),
            [TILE_WORKER_MESSAGE.REGISTER_RUNTIME_PROFILE]: (payload) => {
                registerRuntimeSurfaceProfile(payload);
                return [];
            },
        };
    }
    onMessage(e) {
        const { id, type, payload } = e.data;
        if (!id || !type) return;
        try {
            const handler = this.handlers[type];
            if (!handler) throw new Error(`Unknown TileWorker request type: ${type}`);
            const canvases = handler(payload);
            const bitmaps = canvases.map((c) => c.transferToImageBitmap());
            self.postMessage({ id, bitmaps }, bitmaps);
        } catch (err) {
            console.error("TileWorker Error:", err);
            self.postMessage({ id, error: err.message });
        }
    }
    configureBakeConstants(payload) {
        if (payload.cellSize != null) installTileWorkerBakeConstants(payload);
        return [];
    }
    bakeGroundChunk(payload) {
        return bakeGroundChunkCanvases(payload, this.bakeSession);
    }
    bakeWallAtlas(payload) {
        return bakeWallAtlasCanvases(payload, this.bakeSession);
    }
}
