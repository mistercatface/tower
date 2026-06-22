import { getSurfaceProfileProvider } from "../../Libraries/Procedural/SurfaceProfileProvider.js";
import { bakeGroundChunkCanvases, bakeHorizontalPatchCanvases, bakeWallAtlasCanvases, BakeSession } from "../../Libraries/WorldSurface/WorldSurfacePainter.js";
import { installTileWorkerBakeConstants } from "../../Libraries/WorldSurface/TileWorkerBakeConstants.js";
import { TILE_WORKER_MESSAGE } from "../../Libraries/WorldSurface/TileWorkerMessages.js";
import { invalidateProfileScratch } from "../../Libraries/WorldSurface/ProfileBakeResolver.js";
export class TileSurfaceWorker {
    constructor() {
        this.bakeSession = new BakeSession();
        this.handlers = {
            [TILE_WORKER_MESSAGE.CONFIGURE_BAKE_CONSTANTS]: (payload) => this.configureBakeConstants(payload),
            [TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK]: (payload) => this.bakeGroundChunk(payload),
            [TILE_WORKER_MESSAGE.BAKE_HORIZONTAL_PATCH]: (payload) => this.bakeHorizontalPatch(payload),
            [TILE_WORKER_MESSAGE.BAKE_WALL_ATLAS]: (payload) => this.bakeWallAtlas(payload),
            [TILE_WORKER_MESSAGE.REGISTER_RUNTIME_PROFILE]: (payload) => this.registerRuntimeProfile(payload),
        };
    }
    onMessage(e) {
        const { id, type, payload } = e.data;
        if (!id || !type) return;
        try {
            const handler = this.handlers[type];
            if (!handler) throw new Error(`Unknown TileWorker request type: ${type}`);
            const t0 = performance.now();
            const canvases = handler(payload);
            const t1 = performance.now();
            const bitmaps = canvases.map((c) => c.transferToImageBitmap());
            const t2 = performance.now();
            if (type !== TILE_WORKER_MESSAGE.REGISTER_RUNTIME_PROFILE && type !== TILE_WORKER_MESSAGE.CONFIGURE_BAKE_CONSTANTS)
                console.log(`[TileWorker] ${type} | Compose: ${(t1 - t0).toFixed(2)}ms | Blit/Transfer: ${(t2 - t1).toFixed(2)}ms`);
            self.postMessage({ id, bitmaps }, bitmaps);
        } catch (err) {
            console.error("TileWorker Error:", err);
            self.postMessage({ id, error: err.message });
        }
    }
    configureBakeConstants(payload) {
        installTileWorkerBakeConstants(payload);
        return [];
    }
    bakeGroundChunk(payload) {
        return bakeGroundChunkCanvases(payload, this.bakeSession);
    }
    bakeHorizontalPatch(payload) {
        return bakeHorizontalPatchCanvases(payload, this.bakeSession);
    }
    bakeWallAtlas(payload) {
        return bakeWallAtlasCanvases(payload, this.bakeSession);
    }
    registerRuntimeProfile(payload) {
        getSurfaceProfileProvider().registerRuntime(payload.profileId, payload.profile);
        invalidateProfileScratch(payload.profileId);
        return [];
    }
}
