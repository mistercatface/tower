import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CircleShape, PolygonShape, normalizeKineticBody, stampKineticCircleRadius, stampPrimitivePhysics, entityContainsPointF32 } from "../Libraries/Physics/physics.js";
import { assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
import { PRIMITIVE_PHYSICS_ROW_CIRCLE, PRIMITIVE_PHYSICS_ROW_POLYGON, SHAPE_TYPE_CIRCLE } from "../Core/engineEnums.js";
import { entityFacing } from "../Core/engineMemory.js";

const EID = 20;

function boxShape(hx, hy) {
    return new PolygonShape(new Float32Array([
        -hx, -hy,
        hx, -hy,
        hx, hy,
        -hx, hy,
    ]));
}

function stampPickBody(x, y, radius, shape, facing = 0) {
    const body = {
        id: EID,
        x,
        y,
        vx: 0,
        vy: 0,
        angularVelocity: 0,
        facing,
        radius,
        isSleeping: false,
        isDead: false,
        strategy: stampPrimitivePhysics({
            isKinetic: true,
        }, shape.shapeTypeId === SHAPE_TYPE_CIRCLE ? PRIMITIVE_PHYSICS_ROW_CIRCLE : PRIMITIVE_PHYSICS_ROW_POLYGON),
        shape,
    };
    assignPhysIdWithPose(body, EID);
    entityFacing[EID] = facing;
    normalizeKineticBody(body);
    if (shape.shapeTypeId === SHAPE_TYPE_CIRCLE) stampKineticCircleRadius(EID, radius);
    return body;
}

describe("entityContainsPointF32", () => {
    it("hits inside an axis-aligned box", () => {
        stampPickBody(100, 100, Math.hypot(20, 10), boxShape(20, 10), 0);
        assert.equal(entityContainsPointF32(EID, 110, 100, 0), true);
        assert.equal(entityContainsPointF32(EID, 130, 100, 0), false);
    });
    it("polygon pick rejects points inside the bounding circle but outside the OBB", () => {
        stampPickBody(0, 0, Math.hypot(20, 5), boxShape(20, 5), Math.PI / 2);
        assert.equal(entityContainsPointF32(EID, 15, 0, 0), false);
        assert.equal(entityContainsPointF32(EID, 0, 10, 0), true);
    });
    it("respects padding on polygon edges", () => {
        stampPickBody(0, 0, Math.hypot(10, 10), boxShape(10, 10), 0);
        assert.equal(entityContainsPointF32(EID, 12, 0, 0), false);
        assert.equal(entityContainsPointF32(EID, 12, 0, 3), true);
    });
    it("still hits circle props by radius", () => {
        stampPickBody(0, 0, 5, new CircleShape(5), 0);
        assert.equal(entityContainsPointF32(EID, 4, 0, 0), true);
        assert.equal(entityContainsPointF32(EID, 6, 0, 0), false);
        assert.equal(entityContainsPointF32(EID, 6, 0, 2), true);
    });
});
