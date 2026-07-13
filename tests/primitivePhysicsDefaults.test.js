import { PRIMITIVE_PHYSICS_ROW_CIRCLE, PRIMITIVE_PHYSICS_ROW_POLYGON } from "../Core/engineEnums.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WorldProp, buildWorldPropStrategyFromAsset, applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { primitivePhysics } from "../Core/engineMemory.js";
import { kineticMassFromFootprint } from "../Libraries/Physics/physics.js";
import propCatalog from "../Assets/props/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function walkAssetFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walkAssetFiles(path, out);
        else if (name.endsWith(".asset.js")) out.push(path);
    }
    return out;
}

describe("primitive physics SoA", () => {
    it("strategies carry physicsRow only; coats come from the typed table", () => {
        const ball = buildWorldPropStrategyFromAsset(propCatalog.ball);
        const box = buildWorldPropStrategyFromAsset(propCatalog.box);
        const boid = buildWorldPropStrategyFromAsset(propCatalog.boid_triangle);
        const pinwheel = buildWorldPropStrategyFromAsset(propCatalog.cross_pinwheel);
        assert.equal(ball.physicsRow, PRIMITIVE_PHYSICS_ROW_CIRCLE);
        assert.equal(box.physicsRow, PRIMITIVE_PHYSICS_ROW_POLYGON);
        assert.equal(boid.physicsRow, PRIMITIVE_PHYSICS_ROW_CIRCLE);
        assert.equal(pinwheel.physicsRow, PRIMITIVE_PHYSICS_ROW_POLYGON);
        assert.equal(ball.density, undefined);
        assert.equal(ball.friction, undefined);
        assert.equal(ball.wallRestitution, undefined);
        assert.equal(ball.wallFriction, undefined);
        assert.equal(box.wallFriction, undefined);
        assert.equal(ball.wallPhysics, undefined);
        assert.equal(box.wallPhysics, undefined);
        assert.equal(primitivePhysics.density[ball.physicsRow], primitivePhysics.density[PRIMITIVE_PHYSICS_ROW_CIRCLE]);
        assert.equal(primitivePhysics.density[box.physicsRow], primitivePhysics.density[PRIMITIVE_PHYSICS_ROW_POLYGON]);
        assert.equal(primitivePhysics.dragFriction[ball.physicsRow], primitivePhysics.dragFriction[PRIMITIVE_PHYSICS_ROW_CIRCLE]);
        assert.equal(primitivePhysics.dragFriction[box.physicsRow], primitivePhysics.dragFriction[PRIMITIVE_PHYSICS_ROW_POLYGON]);
        assert.equal(primitivePhysics.wallFriction[boid.physicsRow], primitivePhysics.wallFriction[ball.physicsRow]);
        assert.equal(primitivePhysics.density[pinwheel.physicsRow], primitivePhysics.density[box.physicsRow]);
    });

    it("resized box changes mass but keeps polygon physicsRow", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        assert.equal(prop.strategy.physicsRow, PRIMITIVE_PHYSICS_ROW_POLYGON);
        const smallMass = kineticMassFromFootprint(prop);
        applyPropBoxFootprint(prop, 24, 24);
        assert.ok(kineticMassFromFootprint(prop) > smallMass);
        assert.equal(prop.strategy.physicsRow, PRIMITIVE_PHYSICS_ROW_POLYGON);
    });

    it("catalog assets have no wallPhysics density friction spawn or floorBeltKind", () => {
        const files = walkAssetFiles(join(root, "Assets/props"));
        const banned = /\bwallPhysics\b|\bdensity\s*:|\bfriction\s*:|\bspawn\s*:|\bfloorBeltKind\b/;
        for (const file of files) {
            const src = readFileSync(file, "utf8");
            assert.equal(banned.test(src), false, file);
        }
    });
});
