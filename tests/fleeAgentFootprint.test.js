import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { getEntityCollisionParts } from "../Libraries/Spatial/collision/SatCollision.js";
import { momentOfInertiaFromBody } from "../Libraries/Motion/bodyMass.js";
import {
    buildFleeAgentCompoundGeometry,
    applyFleeAgentCompoundGeometry,
    resolveFleeAgentWedgeRadius,
} from "../Libraries/Game/snake/fleeAgent/fleeAgentFootprint.js";

loadPropAssets();

function mockBallProp(bodyRadius) {
    return {
        id: 1,
        x: 0,
        y: 0,
        facing: 0,
        strategy: { isKinetic: true, density: 0.007958 },
        stateTimer: 0,
    };
}

describe("flee agent compound footprint", () => {
    it("builds circle + wedge collision parts in ball-local space", () => {
        applySnakeGameConfig({ startRadius: 2, linkSlack: 1.05 });
        const bodyRadius = 2;
        const wedgeRadius = resolveFleeAgentWedgeRadius(bodyRadius);
        const geometry = buildFleeAgentCompoundGeometry(bodyRadius);
        assert.equal(geometry.collisionParts.length, 2);
        assert.equal(geometry.collisionParts[0].type, "Circle");
        assert.equal(geometry.collisionParts[0].radius, bodyRadius);
        assert.equal(geometry.collisionParts[1].type, "Polygon");
        assert.equal(geometry.collisionParts[1].vertices.length, 3);
        assert.ok(geometry.footprintArea > Math.PI * bodyRadius * bodyRadius);
        assert.ok(geometry.boundingRadius >= bodyRadius);
        let tipX = -Infinity;
        for (let i = 0; i < geometry.wedgeVertices.length; i++) tipX = Math.max(tipX, geometry.wedgeVertices[i].x);
        assert.ok(tipX > bodyRadius + wedgeRadius * 0.5);
        assert.ok(tipX > geometry.wedgeVertices[0].x);
        assert.ok(tipX > geometry.wedgeVertices[1].x);
    });

    it("applyFleeAgentCompoundGeometry wires collision parts and kinetic mass", () => {
        applySnakeGameConfig({ startRadius: 2, linkSlack: 1.05 });
        const prop = mockBallProp(2);
        const geometry = applyFleeAgentCompoundGeometry(prop, 2);
        assert.equal(prop.shape, geometry.collisionParts[0]);
        assert.equal(prop.collisionParts.length, 2);
        assert.equal(prop.footprintArea, geometry.footprintArea);
        assert.equal(prop.radius, geometry.boundingRadius);
        assert.equal(prop.strategy.radius, 2);
        assert.ok(prop.mass > 0);
        assert.ok(momentOfInertiaFromBody(prop) > 0);
        const parts = getEntityCollisionParts(prop);
        assert.equal(parts.length, 2);
    });
});
