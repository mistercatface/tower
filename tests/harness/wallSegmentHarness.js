import { allocStaticWallSegment, staticWallSegmentSlab, GrowI32, WALL_SEG_VOXEL, WALL_SEG_EDGE_RAIL } from "../../Core/engineMemory.js";

export { WALL_SEG_VOXEL, WALL_SEG_EDGE_RAIL };

export function mockWallSegment(x, y, size = 16, opts = {}) {
    const id = allocStaticWallSegment();
    const slab = staticWallSegmentSlab;
    const width = opts.width ?? size;
    const height = opts.height ?? size;
    slab.x[id] = x;
    slab.y[id] = y;
    slab.angle[id] = opts.angle ?? 0;
    slab.width[id] = width;
    slab.height[id] = height;
    slab.size[id] = Math.max(width, height);
    slab.gridIdx[id] = opts.gridIdx ?? 0;
    slab.gridSide[id] = opts.gridSide ?? 0;
    slab.flags[id] = opts.flags ?? 0;
    slab.shapeRefs[id] = null;
    return id;
}

export function wallSegIds(...ids) {
    const out = new GrowI32(Math.max(ids.length, 1));
    for (let i = 0; i < ids.length; i++) out.push(ids[i]);
    return out;
}
