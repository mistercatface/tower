import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CircleShape, PolygonShape } from "../Libraries/Physics/physics.js";
import { worldPropContainsPoint } from "../GameState/EntityRegistry.js";
import { entityX, entityY, entityR, entityFacing, entityRefs } from "../Core/engineMemory.js";

const EID = 20;

function seedPickEid(x, y, radius, shape, facing = 0) {
    entityX[EID] = x;
    entityY[EID] = y;
    entityR[EID] = radius;
    entityFacing[EID] = facing;
    entityRefs[EID] = { shape, radius };
}

function boxShape(hx, hy) {
    return new PolygonShape(new Float32Array([
        -hx, -hy,
        hx, -hy,
        hx, hy,
        -hx, hy,
    ]));
}

describe("worldPropContainsPoint", () => {
    it("hits inside an axis-aligned box", () => {
        seedPickEid(100, 100, Math.hypot(20, 10), boxShape(20, 10), 0);
        assert.equal(worldPropContainsPoint(EID, 110, 100, 0), true);
        assert.equal(worldPropContainsPoint(EID, 130, 100, 0), false);
    });
    it("polygon pick rejects points inside the bounding circle but outside the OBB", () => {
        seedPickEid(0, 0, Math.hypot(20, 5), boxShape(20, 5), Math.PI / 2);
        assert.equal(worldPropContainsPoint(EID, 15, 0, 0), false);
        assert.equal(worldPropContainsPoint(EID, 0, 10, 0), true);
    });
    it("respects padding on polygon edges", () => {
        seedPickEid(0, 0, Math.hypot(10, 10), boxShape(10, 10), 0);
        assert.equal(worldPropContainsPoint(EID, 12, 0, 0), false);
        assert.equal(worldPropContainsPoint(EID, 12, 0, 3), true);
    });
    it("still hits circle props by radius", () => {
        seedPickEid(0, 0, 5, new CircleShape(5), 0);
        assert.equal(worldPropContainsPoint(EID, 4, 0, 0), true);
        assert.equal(worldPropContainsPoint(EID, 6, 0, 0), false);
        assert.equal(worldPropContainsPoint(EID, 6, 0, 2), true);
    });
});
