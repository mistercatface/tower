import { SharedEdgeSolver } from "../../Libraries/Deprecated/sharedEdges/SharedEdgeSolver.js";
let wallGeometryView = null;
let wallSharedEdgesView = null;
self.onmessage = function (e) {
    const { id, type, payload } = e.data;
    if (!type) return;
    try {
        if (type === "initSharedEdgesSAB") {
            wallGeometryView = new Float32Array(payload.wallGeometrySab);
            wallSharedEdgesView = new Uint8Array(payload.wallSharedEdgesSab);
            return;
        }
        if (type === "rebuildSharedEdges") {
            if (!wallGeometryView) throw new Error("SharedEdge worker SAB not initialized");
            SharedEdgeSolver.solve(wallGeometryView, wallSharedEdgesView, payload.numWalls);
            self.postMessage({ id });
            return;
        }
        throw new Error(`Unknown SharedEdge worker request type: ${type}`);
    } catch (err) {
        console.error("SharedEdgeWorker Error:", err);
        self.postMessage({ id, error: err.message });
    }
};
