import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WorldProp, buildWorldPropStrategyFromAsset, applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { primitivePhysics, PRIMITIVE_PHYSICS_ROW_CIRCLE, PRIMITIVE_PHYSICS_ROW_POLYGON } from "../Core/engineMemory.js";
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
    it("stamps circle and polygon rows from the typed table", () => {
        const ball = buildWorldPropStrategyFromAsset(propCatalog.ball);
        const box = buildWorldPropStrategyFromAsset(propCatalog.box);
        const boid = buildWorldPropStrategyFromAsset(propCatalog.boid_triangle);
        const pinwheel = buildWorldPropStrategyFromAsset(propCatalog.cross_pinwheel);
        assert.equal(ball.density, primitivePhysics.density[PRIMITIVE_PHYSICS_ROW_CIRCLE]);
        assert.equal(ball.friction, primitivePhysics.dragFriction[PRIMITIVE_PHYSICS_ROW_CIRCLE]);
        assert.equal(ball.wallRestitution, primitivePhysics.wallRestitution[PRIMITIVE_PHYSICS_ROW_CIRCLE]);
        assert.equal(ball.wallFriction, primitivePhysics.wallFriction[PRIMITIVE_PHYSICS_ROW_CIRCLE]);
        assert.equal(box.density, primitivePhysics.density[PRIMITIVE_PHYSICS_ROW_POLYGON]);
        assert.equal(box.wallFriction, primitivePhysics.wallFriction[PRIMITIVE_PHYSICS_ROW_POLYGON]);
        assert.equal(boid.wallFriction, ball.wallFriction);
        assert.equal(pinwheel.density, box.density);
        assert.equal(ball.wallPhysics, undefined);
        assert.equal(box.wallPhysics, undefined);
    });

    it("resized box changes mass but keeps polygon wall friction", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        const friction = prop.strategy.wallFriction;
        const smallMass = kineticMassFromFootprint(prop);
        applyPropBoxFootprint(prop, 24, 24);
        assert.ok(kineticMassFromFootprint(prop) > smallMass);
        assert.equal(prop.strategy.wallFriction, friction);
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
