import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PolygonShape } from "../Libraries/Physics/physics.js";
import { bakePoxelOutline, buildGeometryFromPoxelParts, localBoxOutline, splitPoxels } from "../Libraries/Props/fractureSystem.js";

describe("poxel fracture", () => {
    it("bakes multiple poxels from a box outline", () => {
        const geom = bakePoxelOutline(localBoxOutline(8, 8));
        assert.ok(geom.poxels.length > 1);
        assert.equal(geom.footprintVertices.length % 2, 0);
        assert.ok(geom.footprintArea > 0);
        assert.ok(geom.boundingRadius > 0);
    });
    it("buildGeometryFromPoxelParts produces a polygon collision footprint", () => {
        const crate = bakePoxelOutline(localBoxOutline(8, 8));
        const subset = crate.poxels.slice(0, 4).map((p) => ({ vertices: p.vertices }));
        const frag = buildGeometryFromPoxelParts(subset);
        assert.ok(frag.footprintVertices.length >= 6);
        const shape = new PolygonShape(frag.footprintVertices);
        assert.equal(shape.type, "Polygon");
        assert.ok(shape.vertices.length / 2 >= 3);
    });
    it("splitPoxels breaks connectivity on a strong center hit", () => {
        const geom = bakePoxelOutline(localBoxOutline(8, 8));
        const components = splitPoxels(geom.poxels, 0, 0, 80);
        assert.ok(components.length > 1);
    });
});
