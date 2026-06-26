import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PolygonShape } from "../Libraries/Spatial/collision/Shapes.js";
import { worldPropContainsPoint } from "../GameState/EntityRegistry.js";
function boxProp(x, y, hx, hy, facing = 0) {
    return {
        x,
        y,
        facing,
        radius: Math.hypot(hx, hy),
        shape: new PolygonShape([
            { x: -hx, y: -hy },
            { x: hx, y: -hy },
            { x: hx, y: hy },
            { x: -hx, y: hy },
        ]),
    };
}
describe("worldPropContainsPoint", () => {
    it("hits inside an axis-aligned box", () => {
        const prop = boxProp(100, 100, 20, 10, 0);
        assert.equal(worldPropContainsPoint(prop, 110, 100, 0), true);
        assert.equal(worldPropContainsPoint(prop, 130, 100, 0), false);
    });
    it("polygon pick rejects points inside the bounding circle but outside the OBB", () => {
        const prop = boxProp(0, 0, 20, 5, Math.PI / 2);
        assert.equal(worldPropContainsPoint(prop, 15, 0, 0), false);
        assert.equal(worldPropContainsPoint(prop, 0, 10, 0), true);
    });
    it("respects padding on polygon edges", () => {
        const prop = boxProp(0, 0, 10, 10, 0);
        assert.equal(worldPropContainsPoint(prop, 12, 0, 0), false);
        assert.equal(worldPropContainsPoint(prop, 12, 0, 3), true);
    });
    it("still hits circle props by radius", () => {
        const prop = {
            x: 0,
            y: 0,
            radius: 5,
            shape: { type: "Circle", radius: 5 },
        };
        assert.equal(worldPropContainsPoint(prop, 4, 0, 0), true);
        assert.equal(worldPropContainsPoint(prop, 6, 0, 0), false);
        assert.equal(worldPropContainsPoint(prop, 6, 0, 2), true);
    });
});
