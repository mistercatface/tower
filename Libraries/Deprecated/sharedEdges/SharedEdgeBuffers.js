export const MAX_WALLS = 10000;
export const STRIDE = 6;
export const wallGeometrySab = new SharedArrayBuffer(MAX_WALLS * STRIDE * 4);
export const wallGeometryView = new Float32Array(wallGeometrySab);
export const wallSharedEdgesSab = new SharedArrayBuffer(MAX_WALLS);
export const wallSharedEdgesView = new Uint8Array(wallSharedEdgesSab);
