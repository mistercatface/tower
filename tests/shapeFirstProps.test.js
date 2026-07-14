import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp } from "../Libraries/Props/props.js";
import { applyPropBoxFootprint, entityFootprintHalfExtentsInto } from "../Libraries/Props/props.js";
import { kineticFootprintArea } from "../Libraries/Physics/physics.js";
import { SHAPE_TYPE_CIRCLE, SHAPE_TYPE_POLYGON } from "../Core/engineEnums.js";
import { polygonSignedArea2D } from "../Libraries/Math/math.js";
import { ENGINE_F32, M_VEC_A } from "../Core/engineMemory.js";
import { setCirclePropRadius } from "../Libraries/Props/props.js";
describe("shape-first props", () => {
    it("box builds a four-corner polygon from localFootprint", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        const shape = prop.shape;
        assert.equal(shape.shapeTypeId, SHAPE_TYPE_POLYGON);
        assert.equal(shape.vertices.length / 2, 4);
        assert.equal(kineticFootprintArea(prop), 256);
    });
    it("box can use a 16×8 rectangle footprint", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        applyPropBoxFootprint(prop, 8, 4);
        const shape = prop.shape;
        assert.equal(shape.shapeTypeId, SHAPE_TYPE_POLYGON);
        assert.equal(Math.abs(polygonSignedArea2D(shape.vertices)), 128);
        assert.equal(kineticFootprintArea(prop), 128);
    });
    it("ball radius can be resized after spawn", () => {
        const prop = new WorldProp(0, 0, "ball", 0);
        setCirclePropRadius(prop, 7);
        assert.equal(prop.shape.shapeTypeId, SHAPE_TYPE_CIRCLE);
        assert.equal(prop.shape.radius, 7);
    });
    it("box footprint can be resized after spawn", () => {
        const prop = new WorldProp(10, 20, "box", 0);
        applyPropBoxFootprint(prop, 12, 5);
        entityFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, prop._physId);
        assert.equal(ENGINE_F32[M_VEC_A], 12);
        assert.equal(ENGINE_F32[M_VEC_A + 1], 5);
        assert.equal(prop.shape.vertices.length / 2, 4);
        assert.equal(kineticFootprintArea(prop), 240);
    });
    it("hex block builds a six-vertex polygon from localFootprint", () => {
        const prop = new WorldProp(0, 0, "hex_block", 0);
        assert.equal(prop.shape.shapeTypeId, SHAPE_TYPE_POLYGON);
        assert.equal(prop.shape.vertices.length / 2, 6);
    });
});
