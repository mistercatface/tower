import { surfaceProceduralProfiles } from "../../Config/procedural/profiles.js";
import { getSurfaceProfileProvider, installSurfaceProfileProvider } from "../../Libraries/Procedural/SurfaceProfileProvider.js";
import { SharedEdgeSolver } from "../../Libraries/Spatial/structure/SharedEdgeSolver.js";
import { bakeGroundChunkCanvases, bakeHorizontalPatchCanvases, bakeWallAtlasCanvases } from "../../Libraries/WorldSurface/WorldSurfacePainter.js";
import { invalidateProfileScratch } from "../../Libraries/WorldSurface/ProfileBakeResolver.js";
installSurfaceProfileProvider({ profiles: surfaceProceduralProfiles });
let wallGeometrySab = null;
let wallGeometryView = null;
let wallSharedEdgesSab = null;
let wallSharedEdgesView = null;
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
    initSharedEdgesSAB(payload) {
        wallGeometrySab = payload.wallGeometrySab;
        wallGeometryView = new Float32Array(wallGeometrySab);
        wallSharedEdgesSab = payload.wallSharedEdgesSab;
        wallSharedEdgesView = new Uint8Array(wallSharedEdgesSab);
        return [];
    },
    rebuildSharedEdges(payload) {
        if (!wallGeometryView) return [];
        SharedEdgeSolver.solve(wallGeometryView, wallSharedEdgesView, payload.numWalls);
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
