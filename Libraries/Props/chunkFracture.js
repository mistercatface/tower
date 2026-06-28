import { boxLocalFootprint } from "../Math/Poly2D.js";
import { PolygonShape } from "../Spatial/collision/Shapes.js";
import { buildGeometryFromPartsAtOrigin, buildGeometryFromPoxelParts } from "./poxelFracture.js";
// chunks = split connectivity graph; collisionParts = merged axis-aligned sim/draw rects
export const CHUNK_MIN_CELL = 8;
export const CHUNK_MAX_CELLS_PER_AXIS = 6;
const RECT_MERGE_EPS = 1e-3;
function halfExtentsFromFlat(flatVerts) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const count = flatVerts.length / 2;
    for (let i = 0; i < count; i++) {
        const x = flatVerts[i * 2];
        const y = flatVerts[i * 2 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return { hx: (maxX - minX) * 0.5, hy: (maxY - minY) * 0.5 };
}
export function cellSizeForBoxExtents(hx, hy) {
    const span = Math.min(hx * 2, hy * 2);
    const cellsPerAxis = Math.min(CHUNK_MAX_CELLS_PER_AXIS, Math.max(2, Math.round(span / 16)));
    return Math.max(CHUNK_MIN_CELL, span / cellsPerAxis);
}
function rectFromChunk(chunk) {
    const v = chunk.vertices;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < v.length / 2; i++) {
        const x = v[i * 2];
        const y = v[i * 2 + 1];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1 };
}
function mergeRectsHorizontally(rects) {
    const groups = new Map();
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        const key = `${r.y0.toFixed(4)};${r.y1.toFixed(4)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }
    const out = [];
    for (const group of groups.values()) {
        group.sort((a, b) => a.x0 - b.x0);
        let cur = group[0];
        for (let i = 1; i < group.length; i++) {
            const next = group[i];
            if (Math.abs(cur.x1 - next.x0) <= RECT_MERGE_EPS) cur = { x0: cur.x0, y0: cur.y0, x1: next.x1, y1: cur.y1 };
            else {
                out.push(cur);
                cur = next;
            }
        }
        out.push(cur);
    }
    return out;
}
function mergeRectsVertically(rects) {
    const groups = new Map();
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        const key = `${r.x0.toFixed(4)};${r.x1.toFixed(4)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }
    const out = [];
    for (const group of groups.values()) {
        group.sort((a, b) => a.y0 - b.y0);
        let cur = group[0];
        for (let i = 1; i < group.length; i++) {
            const next = group[i];
            if (Math.abs(cur.y1 - next.y0) <= RECT_MERGE_EPS) cur = { x0: cur.x0, y0: cur.y0, x1: cur.x1, y1: next.y1 };
            else {
                out.push(cur);
                cur = next;
            }
        }
        out.push(cur);
    }
    return out;
}
export function mergeChunkCollisionRects(chunks) {
    let rects = chunks.map(rectFromChunk);
    let prev = rects.length + 1;
    while (rects.length < prev) {
        prev = rects.length;
        rects = mergeRectsVertically(mergeRectsHorizontally(rects));
    }
    return rects;
}
function rectArea(rect) {
    return (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
}
function chunkMaterialArea(chunks) {
    let area = 0;
    for (let i = 0; i < chunks.length; i++) area += rectArea(rectFromChunk(chunks[i]));
    return area;
}
function polygonShapeFromRect(rect) {
    return new PolygonShape(new Float32Array([rect.x0, rect.y0, rect.x1, rect.y0, rect.x1, rect.y1, rect.x0, rect.y1]));
}
function collisionPartsFromChunks(chunks) {
    return mergeChunkCollisionRects(chunks).map(polygonShapeFromRect);
}
function boundingRadiusFromParts(collisionParts) {
    let maxR = 0;
    for (let i = 0; i < collisionParts.length; i++) maxR = Math.max(maxR, collisionParts[i].getBoundingRadius());
    return maxR;
}
function footprintVerticesFromParts(collisionParts) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let p = 0; p < collisionParts.length; p++) {
        const verts = collisionParts[p].vertices;
        const count = verts.length;
        for (let i = 0; i < count; i += 2) {
            const x = verts[i];
            const y = verts[i + 1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    return new Float32Array([minX, minY, maxX, minY, maxX, maxY, minX, maxY]);
}
function withChunkCollisionParts(geom) {
    const collisionParts = collisionPartsFromChunks(geom.chunks);
    const footprintVertices = footprintVerticesFromParts(collisionParts);
    return { ...geom, collisionParts, footprintVertices, footprintArea: chunkMaterialArea(geom.chunks), boundingRadius: boundingRadiusFromParts(collisionParts) };
}
function centerFlatVerts(flatVerts) {
    const count = flatVerts.length / 2;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < count; i++) {
        cx += flatVerts[i * 2];
        cy += flatVerts[i * 2 + 1];
    }
    cx /= count;
    cy /= count;
    const centered = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
        centered[i * 2] = flatVerts[i * 2] - cx;
        centered[i * 2 + 1] = flatVerts[i * 2 + 1] - cy;
    }
    return centered;
}
export function rectGridParts(hx, hy, cellSize) {
    const cols = Math.max(1, Math.round((hx * 2) / cellSize));
    const rows = Math.max(1, Math.round((hy * 2) / cellSize));
    const cellW = (hx * 2) / cols;
    const cellH = (hy * 2) / rows;
    const parts = [];
    for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
            const x0 = -hx + col * cellW;
            const y0 = -hy + row * cellH;
            const x1 = x0 + cellW;
            const y1 = y0 + cellH;
            parts.push({ vertices: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]) });
        }
    return parts;
}
export function buildGeometryFromChunkParts(localParts) {
    const geom = buildGeometryFromPoxelParts(localParts);
    return withChunkCollisionParts({ footprintVertices: geom.footprintVertices, chunks: geom.poxels, footprintArea: geom.footprintArea, boundingRadius: geom.boundingRadius, centroid: geom.centroid });
}
export function buildChunkGeometryAtPropOrigin(localParts) {
    const geom = buildGeometryFromPartsAtOrigin(localParts);
    return withChunkCollisionParts({ footprintVertices: geom.footprintVertices, chunks: geom.poxels, footprintArea: geom.footprintArea, boundingRadius: geom.boundingRadius });
}
export function bakeChunkOutline(flatVerts) {
    const centeredVerts = centerFlatVerts(flatVerts);
    const { hx, hy } = halfExtentsFromFlat(centeredVerts);
    const parts = rectGridParts(hx, hy, cellSizeForBoxExtents(hx, hy));
    const mesh = buildGeometryFromPartsAtOrigin(parts.map((p) => ({ vertices: p.vertices })));
    return {
        chunks: mesh.poxels,
        collisionParts: [new PolygonShape(boxLocalFootprint(hx, hy))],
        footprintVertices: boxLocalFootprint(hx, hy),
        boundingRadius: Math.hypot(hx, hy),
        footprintArea: hx * hy * 4,
    };
}
export function chunkCellCount(hx, hy, cellSize = cellSizeForBoxExtents(hx, hy)) {
    const cols = Math.max(1, Math.round((hx * 2) / cellSize));
    const rows = Math.max(1, Math.round((hy * 2) / cellSize));
    return cols * rows;
}
export function chunkCollisionPartsArea(collisionParts) {
    let area = 0;
    for (let i = 0; i < collisionParts.length; i++) {
        const verts = collisionParts[i].vertices;
        const w = Math.abs(verts[2] - verts[0]);
        const h = Math.abs(verts[5] - verts[3]);
        area += w * h;
    }
    return area;
}
