import { surfaceProceduralProfiles } from "../../Config/procedural/profiles.js";
import { getSurfaceProfileProvider, installSurfaceProfileProvider } from "../../Libraries/Procedural/SurfaceProfileProvider.js";
import { bakeGroundChunkCanvases, bakeHorizontalPatchCanvases, bakeWallAtlasCanvases } from "../../Libraries/WorldSurface/WorldSurfacePainter.js";
import { invalidateProfileScratch } from "../../Libraries/WorldSurface/ProfileBakeResolver.js";
installSurfaceProfileProvider({ profiles: surfaceProceduralProfiles });
const HANDLERS = {
    bakeGroundChunk(payload) {
        return bakeGroundChunkCanvases(payload);
    },
    bakeHorizontalPatch(payload) {
        return bakeHorizontalPatchCanvases(payload);
    },
    bakeWallAtlas(payload) {
        return bakeWallAtlasCanvases(payload);
    },
    registerRuntimeProfile(payload) {
        getSurfaceProfileProvider().registerRuntime(payload.profileId, payload.profile);
        invalidateProfileScratch(payload.profileId);
        return [];
    },
};
self.onmessage = function (e) {
    const { id, type, payload } = e.data;
    if (!id || !type) return;
    try {
        const handler = HANDLERS[type];
        if (!handler) throw new Error(`Unknown TileWorker request type: ${type}`);
        const canvases = handler(payload);
        const bitmaps = canvases.map((c) => c.transferToImageBitmap());
        self.postMessage({ id, bitmaps }, bitmaps);
    } catch (err) {
        console.error("TileWorker Error:", err);
        self.postMessage({ id, error: err.message });
    }
};
