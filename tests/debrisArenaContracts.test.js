import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp, applyPropBoxFootprint } from "../Libraries/Props/props.js";
import { createFractureWorld, setupPropForFracture, liveDebrisEids, eidInKineticFrame, assertDebrisKind } from "./harness/fractureHarness.js";
import { KineticSpatialFrame } from "../Libraries/Spatial/spatial.js";
import { ENTITY_KIND_DEBRIS, ENTITY_KIND_WORLD_PROP, DRAW_KIND_PROP, ENTITY_FLAG_RENDER_3D } from "../Core/engineEnums.js";
import {
    entityAlive,
    entityKind,
    entityVx,
    entityVy,
    entityWallProfileId,
    entityWallHeightPx,
    entityRenderKeyId,
    entityFadeOutMs,
    entityFadeDurationMs,
    entityFlags,
    kineticDynamicSlab,
    recomputeViewBounds,
    getProfileId,
    entityR,
    VIEW_TIER_PROPS,
} from "../Core/engineMemory.js";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { tickEntityFrames } from "../Libraries/Physics/physics.js";
import { addWorldPropsToState } from "../GameState/EntityRegistry.js";
import { WorldSceneRenderer } from "../Libraries/Render/render.js";

function realFrameWorld() {
    const world = createFractureWorld();
    const frame = new KineticSpatialFrame(16);
    frame.resetFrame(world.obstacleGrid);
    world.spatialFrame = frame;
    return { world, frame };
}

describe("debris arena contracts", () => {
    it("C1: admitKineticEids pushes already-alive DEBRIS eid into kineticEids", () => {
        const { world, frame } = realFrameWorld();
        const prop = new WorldProp(10, 20, "wall_rail_chunk", 0);
        applyPropBoxFootprint(prop, 8, 2);
        const eid = world.entityRegistry.register(ENTITY_KIND_DEBRIS, prop);
        assert.equal(entityAlive[eid], 1);
        assert.equal(entityKind[eid], ENTITY_KIND_DEBRIS);
        frame.admitKineticEids([eid], 1, world);
        assert.ok(eidInKineticFrame(frame, eid), "pre-bound DEBRIS must join kineticEids");
        frame.syncActiveKineticBodies();
        assert.ok(kineticDynamicSlab.activeSlot[eid] >= 0, "admitted DEBRIS must be active");
    });

    it("C2: shatter presentation columns survive admit", () => {
        const { world, frame } = realFrameWorld();
        const prop = new WorldProp(50, 50, "wall_voxel_chunk", 0);
        setupPropForFracture(prop, 32, 32);
        prop.wallChunkProfileId = "chunk-profile";
        prop.wallChunkHeightPx = 64;
        addWorldPropsToState(world, [prop]);
        assert.ok(FractureEngine.fracturePropOnImpact(prop, 50, 50, 30, world.fractureEngine));
        const shards = FractureEngine.commitFractureResult(world, prop, frame);
        assert.ok(shards.length >= 1);
        for (const shard of shards) {
            const eid = shard._physId;
            assert.ok(assertDebrisKind(shard));
            assert.equal(entityKind[eid], ENTITY_KIND_DEBRIS);
            assert.notEqual(entityWallProfileId[eid], 0);
            assert.ok(entityWallHeightPx[eid] > 0);
            assert.notEqual(entityRenderKeyId[eid], 0);
            assert.ok(eidInKineticFrame(frame, eid));
        }
    });

    it("C3: spawn impulse survives admit and pool recycle", () => {
        const { world, frame } = realFrameWorld();
        const parent = new WorldProp(0, 0, "wall_voxel_chunk", 0);
        applyPropBoxFootprint(parent, 8, 8);
        parent.wallChunkProfileId = "chunk-profile";
        parent.wallChunkHeightPx = 32;
        parent.height = 32;
        parent.vx = -40;
        parent.vy = -40;
        parent.angularVelocity = 0.5;
        const shards = world.fractureEngine.spawnIntactWallChunk(parent, frame);
        assert.ok(shards.length >= 1);
        assert.ok(shards.every((s) => Math.hypot(entityVx[s._physId], entityVy[s._physId]) > 5));
        for (const s of shards) world.fractureEngine.releaseDebrisEid(s._physId, frame);
        assert.equal(liveDebrisEids(world.entityRegistry).length, 0);
        const again = world.fractureEngine.spawnIntactWallChunk(parent, frame);
        assert.ok(again.every((s) => Math.hypot(entityVx[s._physId], entityVy[s._physId]) > 5), "recycled admit must keep spawn impulse");
    });

    it("C4: draw queue includes DEBRIS via registry view fill", () => {
        const { world, frame } = realFrameWorld();
        const prop = new WorldProp(0, 0, "wall_rail_chunk", 0);
        applyPropBoxFootprint(prop, 8, 2);
        prop.wallChunkProfileId = "edge-profile";
        prop.wallChunkHeightPx = 32;
        const eid = world.entityRegistry.register(ENTITY_KIND_DEBRIS, prop);
        entityFlags[eid] |= ENTITY_FLAG_RENDER_3D;
        entityWallProfileId[eid] = getProfileId("edge-profile");
        entityWallHeightPx[eid] = 32;
        frame.admitKineticEids([eid], 1, world);
        frame.begin(world);
        recomputeViewBounds(0, 0, 500, 500);
        const renderer = new WorldSceneRenderer();
        const viewport = { x: 0, y: 0 };
        renderer._appendVisible3dProps(world, viewport);
        let found = false;
        for (let i = 0; i < renderer.visibleDrawQueue.length; i++) {
            if (renderer.visibleDrawQueue.kinds[i] === DRAW_KIND_PROP && renderer.visibleDrawQueue.eids[i] === eid) found = true;
        }
        assert.ok(found, "DEBRIS must enter DRAW_KIND_PROP queue without debris.appendVisibleProps");
        assert.equal(world.fractureEngine.debris, undefined);
    });

    it("C8: large entityR DEBRIS stays in view when centroid is outside by 0.6R", () => {
        const { world, frame } = realFrameWorld();
        const prop = new WorldProp(120, 0, "wall_voxel_chunk", 0);
        applyPropBoxFootprint(prop, 8, 8);
        const eid = world.entityRegistry.register(ENTITY_KIND_DEBRIS, prop);
        frame.admitKineticEids([eid], 1, world);
        frame.begin(world);
        const R = 80;
        entityR[eid] = R;
        entityFlags[eid] |= ENTITY_FLAG_RENDER_3D;
        // Props tier: center 0 halfW 50 + pad 20 → maxX=70. Centroid x=120 → 50 outside (>R/2, <R).
        recomputeViewBounds(0, 0, 50, 50);
        const match3d = (e) => (entityFlags[e] & ENTITY_FLAG_RENDER_3D) !== 0;
        // null frame → live-list candidates; fine cull must use full entityR (not radius/2)
        const count = world.entityRegistry.queryViewTier(null, VIEW_TIER_PROPS, "3d", match3d);
        const ids = world.entityRegistry.borrowedQueryIds("3d");
        let found = false;
        for (let i = 0; i < count; i++) if (ids[i] === eid) found = true;
        assert.ok(found, "full-R circle cull must keep large shard visible when only centroid is off-screen");
    });

    it("C5: sandbox WORLD_PROP walks ignore DEBRIS", () => {
        const { world } = realFrameWorld();
        const placed = new WorldProp(0, 0, "box", 0);
        world.entityRegistry.register(ENTITY_KIND_WORLD_PROP, placed);
        const shard = new WorldProp(40, 0, "wall_rail_chunk", 0);
        world.entityRegistry.register(ENTITY_KIND_DEBRIS, shard);
        const visited = [];
        world.entityRegistry.forEachOfKind(ENTITY_KIND_WORLD_PROP, (p) => visited.push(p.id));
        assert.deepEqual(visited, [placed.id]);
        assert.ok(world.entityRegistry.getLive(placed.id));
        assert.equal(liveDebrisEids(world.entityRegistry).length, 1);
    });

    it("C6: fade removes DEBRIS from arena and kineticEids", () => {
        const { world, frame } = realFrameWorld();
        const prop = new WorldProp(0, 0, "wall_rail_chunk", 0);
        applyPropBoxFootprint(prop, 8, 2);
        const eid = world.entityRegistry.register(ENTITY_KIND_DEBRIS, prop);
        assert.ok(entityFadeOutMs[eid] >= 0);
        frame.admitKineticEids([eid], 1, world);
        const fadeMs = entityFadeOutMs[eid];
        const durMs = entityFadeDurationMs[eid];
        tickEntityFrames(frame, world, fadeMs + durMs + 1);
        assert.equal(liveDebrisEids(world.entityRegistry).length, 0);
        assert.ok(!eidInKineticFrame(frame, eid));
    });

    it("C7: begin() repopulates DEBRIS into kineticEids", () => {
        const { world, frame } = realFrameWorld();
        const prop = new WorldProp(12, 8, "wall_rail_chunk", 0);
        applyPropBoxFootprint(prop, 8, 2);
        const eid = world.entityRegistry.register(ENTITY_KIND_DEBRIS, prop);
        frame.admitKineticEids([eid], 1, world);
        assert.ok(eidInKineticFrame(frame, eid));
        const frame2 = frame.begin(world);
        assert.ok(eidInKineticFrame(frame2, eid), "begin must repopulate arena DEBRIS");
    });
});
