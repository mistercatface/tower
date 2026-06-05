import "../WorldSurfaceBootstrap.js";
import { installGameFloorProfileProvider } from "../../Config/procedural/bootstrap.js";
import { getFloorProfileProvider } from "../../Libraries/Procedural/FloorProfileProvider.js";
import { SharedEdgeSolver } from "../../Libraries/Math/SharedEdgeSolver.js";
import { bakeFloorChunkCanvases, bakeWallFaceCanvases } from "./FloorTilePainter.js";
import { invalidateProfileScratch } from "./ProfileBakeResolver.js";

installGameFloorProfileProvider();

let wallGeometrySab = null;
let wallGeometryView = null;
let wallSharedEdgesSab = null;
let wallSharedEdgesView = null;

const HANDLERS = {
    bakeFloorChunk(payload) {
        return bakeFloorChunkCanvases(payload);
    },

    bakeWallFace(payload) {
        return bakeWallFaceCanvases(payload.width, payload.height, payload.p1, payload.p2, payload.pixelsPerUnit, payload.seed, payload.profileId, payload);
    },

    registerRuntimeProfile(payload) {
        getFloorProfileProvider().registerRuntime(payload.profileId, payload.profile);
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
