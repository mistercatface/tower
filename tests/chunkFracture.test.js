import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PolygonShape } from "../Libraries/Physics/physics.js";
import { measureGlassShard } from "../Libraries/Props/glassFracture.js";
import { bakeChunkOutline, buildGeometryFromChunkParts, cellSizeForBoxExtents, chunkCellCount, chunkCollisionPartsArea, chunkNeedsMinCellSubdivide, mergeChunkCollisionRects, rectGridParts } from "../Libraries/Props/chunkFracture.js";
import { localBoxOutline, splitPoxels } from "../Libraries/Props/poxelFracture.js";
import { canFracturePropSplit, fracturePropOnImpact, splitFootprintIntoComponents } from "../Libraries/Props/propFracture.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { kineticDynamicSlab } from "../Libraries/Physics/physics.js";
import { applyPropBoxFootprint } from "../Libraries/Props/propStrategy.js";
import propCatalog from "../Assets/props/index.js";
describe("chunk fracture", () => {
    it("crate asset uses chunk fracture mode", () => {
        assert.equal(propCatalog["crate"].physics.fracture.mode, "chunk");
        assert.equal(propCatalog["custom_box"].physics.fracture.mode, "chunk");
    });
    it("bakes rectilinear chunk grid from a box outline", () => {
        const geom = bakeChunkOutline(localBoxOutline(8, 8));
        assert.ok(geom.chunks.length > 1);
        assert.ok(geom.footprintArea > 0);
        assert.equal(chunkCellCount(8, 8), geom.chunks.length);
    });
    it("chunk cells are axis-aligned rectangles not triangles", () => {
        const geom = bakeChunkOutline(localBoxOutline(8, 8));
        for (const chunk of geom.chunks) {
            assert.equal(chunk.vertices.length, 8);
            const metrics = measureGlassShard(chunk.vertices);
            assert.ok(metrics.aspect <= 4);
        }
    });
    it("buildGeometryFromChunkParts produces convex collision parts", () => {
        const crate = bakeChunkOutline(localBoxOutline(8, 8));
        const subset = crate.chunks.slice(0, 2).map((chunk) => ({ vertices: chunk.vertices }));
        const frag = buildGeometryFromChunkParts(subset);
        assert.ok(frag.collisionParts.length >= 1);
        assert.equal(frag.collisionParts[0].type, "Polygon");
        assert.equal(frag.collisionParts[0].vertices.length / 2, 4);
    });
    it("splitPoxels breaks chunk connectivity on a strong center hit", () => {
        const geom = bakeChunkOutline(localBoxOutline(8, 8));
        const components = splitPoxels(geom.chunks, 0, 0, 80);
        assert.ok(components.length > 1);
    });
    it("fracture crate init builds chunk connectivity grid", () => {
        const prop = new WorldProp(0, 0, "crate", 0);
        assert.ok(prop.strategy.fracture);
        assert.ok(prop.chunks.length > 1);
        assert.ok(prop.collisionParts.length >= 1);
        assert.equal(prop.shape.type, "Polygon");
    });
    it("fracturePropOnImpact peels chunky debris and keeps the largest piece", () => {
        const prop = new WorldProp(100, 200, "crate", 0);
        prop._physId = 0;
        kineticDynamicSlab.x[0] = 100;
        kineticDynamicSlab.y[0] = 200;
        applyPropBoxFootprint(prop, 12, 12);
        const initialChunks = prop.chunks.length;
        const fracture = fracturePropOnImpact(prop, 100, 200, 80);
        assert.ok(fracture);
        assert.ok(prop.chunks.length < initialChunks);
        assert.ok(fracture.debris.length > 0);
        for (const geom of fracture.debris) assert.ok(geom.chunks.length >= 1);
    });
    it("splitFootprintIntoComponents forceExplode yields one fragment per chunk", () => {
        const prop = new WorldProp(0, 0, "crate", 0);
        assert.ok(prop.chunks.length > 1);
        const fragments = splitFootprintIntoComponents(prop, 0, 0, 20, true);
        assert.equal(fragments.length, prop.chunks.length);
    });
    it("fracturePropOnImpact shifts parent position to new centroid", () => {
        const prop = new WorldProp(100, 50, "crate", 0);
        prop._physId = 0;
        kineticDynamicSlab.x[0] = 100;
        kineticDynamicSlab.y[0] = 50;
        applyPropBoxFootprint(prop, 16, 16);
        const fracture = fracturePropOnImpact(prop, 100, 50, 80);
        assert.ok(fracture);
        assert.ok(Math.abs(prop.x - 102.666) < 0.01);
        assert.ok(Math.abs(prop.y - 52.666) < 0.01);
    });
    it("mergeChunkCollisionRects covers concave L-shapes with multiple axis-aligned boxes", () => {
        const geom = bakeChunkOutline(localBoxOutline(16, 16));
        const components = splitPoxels(geom.chunks, 14, 14, 80);
        assert.ok(components.length > 1);
        const parentRects = mergeChunkCollisionRects(components[0]);
        assert.ok(parentRects.length >= 2);
        let area = 0;
        for (const rect of parentRects) area += (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
        let chunkArea = 0;
        for (const chunk of components[0]) {
            const v = chunk.vertices;
            chunkArea += (v[2] - v[0]) * (v[5] - v[1]);
        }
        assert.ok(Math.abs(area - chunkArea) < 1);
    });
    it("64x64 chunk fracture keeps exact material area in collision parts", () => {
        const prop = new WorldProp(0, 0, "custom_box", 0);
        prop._physId = 0;
        kineticDynamicSlab.x[0] = 0;
        kineticDynamicSlab.y[0] = 0;
        applyPropBoxFootprint(prop, 64, 64);
        const intactArea = prop.footprintArea;
        fracturePropOnImpact(prop, 0, 0, 80);
        assert.ok(prop.collisionParts.length >= 1);
        assert.ok(Math.abs(chunkCollisionPartsArea(prop.collisionParts) - prop.footprintArea) < 1);
        assert.ok(prop.footprintArea < intactArea);
        const cornerProp = new WorldProp(100, 100, "custom_box", 0);
        cornerProp._physId = 1;
        kineticDynamicSlab.x[1] = 100;
        kineticDynamicSlab.y[1] = 100;
        applyPropBoxFootprint(cornerProp, 64, 64);
        fracturePropOnImpact(cornerProp, 160, 160, 80);
        assert.ok(cornerProp.collisionParts.length >= 2);
        assert.ok(Math.abs(chunkCollisionPartsArea(cornerProp.collisionParts) - cornerProp.footprintArea) < 1);
    });
    it("large custom box scales chunk cell size and count", () => {
        const cell = cellSizeForBoxExtents(64, 64);
        assert.ok(cell >= 8);
        const geom = bakeChunkOutline(localBoxOutline(64, 64));
        assert.ok(geom.chunks.length >= 16);
        assert.ok(geom.chunks.length <= 100);
    });
    it("single oversized chunk subdivides to min cell size on impact", () => {
        const prop = new WorldProp(0, 0, "custom_box", 0);
        prop._physId = 0;
        kineticDynamicSlab.x[0] = 0;
        kineticDynamicSlab.y[0] = 0;
        applyPropBoxFootprint(prop, 64, 64);
        while (prop.chunks.length > 1) {
            const fracture = fracturePropOnImpact(prop, 0, 0, 80);
            if (!fracture) break;
        }
        assert.equal(prop.chunks.length, 1);
        assert.ok(chunkNeedsMinCellSubdivide(prop.chunks[0]));
        assert.ok(canFracturePropSplit(prop));
        const fracture = fracturePropOnImpact(prop, 0, 0, 80);
        assert.ok(fracture);
        assert.ok(prop.chunks.length > 1);
        for (const chunk of prop.chunks) {
            const v = chunk.vertices;
            const w = Math.abs(v[2] - v[0]);
            const h = Math.abs(v[5] - v[1]);
            assert.ok(w <= 8.01);
            assert.ok(h <= 8.01);
        }
    });
    it("wide rectangle chunk keeps fracturing down to min cell squares", () => {
        const prop = new WorldProp(0, 0, "custom_box", 0);
        applyPropBoxFootprint(prop, 20, 5);
        while (prop.chunks.length > 1) {
            const fracture = fracturePropOnImpact(prop, 0, 0, 80);
            if (!fracture) break;
        }
        assert.equal(prop.chunks.length, 1);
        assert.ok(chunkNeedsMinCellSubdivide(prop.chunks[0]));
        assert.ok(canFracturePropSplit(prop));
        const beforeArea = prop.footprintArea;
        const fracture = fracturePropOnImpact(prop, 0, 0, 80);
        assert.ok(fracture);
        assert.ok(fracture.debris.length > 0);
        assert.ok(prop.footprintArea < beforeArea);
    });
});
