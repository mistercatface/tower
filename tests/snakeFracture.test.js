import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetKineticConstraintIds } from "../Libraries/Physics/physics.js";
import { addChainLink, hasChainLinkBetween } from "../Libraries/Sandbox/sandbox.js";
import { createKineticTestTick, mockKineticCircle, resetMockKineticCircleIds } from "./harness/kineticTickHarness.js";
import { resolveKineticContactPassWithEffects } from "./harness/kineticContactHarness.js";

describe("snake segment impact fracture", () => {
    it("fractures the snake segment on high force impact and splits the chain", () => {
        resetKineticConstraintIds(1);
        resetMockKineticCircleIds(1);

        // Segment A and B are connected snake segments
        const segA = mockKineticCircle(100, 100, 4, 0, 0, { strategy: { canChain: true, rolls: true, fracture: { mode: "circle", minForce: 12 } } });
        segA.type = "snake";
        const segB = mockKineticCircle(108, 100, 4, 0, 0, { strategy: { canChain: true, rolls: true, fracture: { mode: "circle", minForce: 12 } } });
        segB.type = "snake";

        // A heavy impactor moving fast towards segA
        const impactor = mockKineticCircle(93, 100, 4, 200, 0, { strategy: { rolls: true } });
        impactor.type = "ball";

        const tick = createKineticTestTick([segA, segB, impactor]);

        // Link segA and segB
        addChainLink(tick.world, segA.id, segB.id);
        assert.ok(hasChainLinkBetween(tick.world, segA.id, segB.id));

        // Resolve contacts with effects
        resolveKineticContactPassWithEffects(tick);

        // Verify segA (which was hit) is evicted / removed from state
        assert.ok(segA.isDead);
        assert.ok(!tick.world.worldProps.includes(segA));

        // Verify segB (which was not hit) remains in state and is untouched
        assert.ok(tick.world.worldProps.includes(segB));
        assert.ok(!segB.isDead);

        // Verify the chain link is broken
        assert.ok(!hasChainLinkBetween(tick.world, segA.id, segB.id));

        // Verify snake_shards are spawned
        const shards = tick.world.worldProps.filter(p => p.type === "snake_shard");
        assert.ok(shards.length > 0);
        for (const shard of shards) {
            assert.equal(shard.shape.type, "Polygon");
            assert.equal(shard.strategy.isKinetic, true);
        }
    });

    it("does not fracture snake segment on low force impact", () => {
        resetKineticConstraintIds(1);
        resetMockKineticCircleIds(1);

        const segA = mockKineticCircle(100, 100, 4, 0, 0, { strategy: { canChain: true, rolls: true, fracture: { mode: "circle", minForce: 12 } } });
        segA.type = "snake";
        const segB = mockKineticCircle(108, 100, 4, 0, 0, { strategy: { canChain: true, rolls: true, fracture: { mode: "circle", minForce: 12 } } });
        segB.type = "snake";

        // Slow impactor (speed 5)
        const impactor = mockKineticCircle(93, 100, 4, 5, 0, { strategy: { rolls: true } });
        impactor.type = "ball";

        const tick = createKineticTestTick([segA, segB, impactor]);
        addChainLink(tick.world, segA.id, segB.id);

        resolveKineticContactPassWithEffects(tick);

        // Verify segA is NOT evicted
        assert.ok(!segA.isDead);
        assert.ok(tick.world.worldProps.includes(segA));
        assert.ok(hasChainLinkBetween(tick.world, segA.id, segB.id));

        const shards = tick.world.worldProps.filter(p => p.type === "snake_shard");
        assert.equal(shards.length, 0);
    });

    it("fractures the ball segment (snake body segment) on high force impact and splits the chain", () => {
        resetKineticConstraintIds(1);
        resetMockKineticCircleIds(1);

        // Segment A and B are connected ball segments (snake body)
        const segA = mockKineticCircle(100, 100, 4, 0, 0, { strategy: { canChain: true, rolls: true, fracture: { mode: "circle", minForce: 12 } } });
        segA.type = "ball";
        const segB = mockKineticCircle(108, 100, 4, 0, 0, { strategy: { canChain: true, rolls: true, fracture: { mode: "circle", minForce: 12 } } });
        segB.type = "ball";

        // A heavy impactor moving fast towards segA
        const impactor = mockKineticCircle(93, 100, 4, 200, 0, { strategy: { rolls: true } });
        impactor.type = "ball";

        const tick = createKineticTestTick([segA, segB, impactor]);

        addChainLink(tick.world, segA.id, segB.id);

        resolveKineticContactPassWithEffects(tick);

        assert.ok(segA.isDead);
        assert.ok(!tick.world.worldProps.includes(segA));
        assert.ok(tick.world.worldProps.includes(segB));
        assert.ok(!hasChainLinkBetween(tick.world, segA.id, segB.id));

        const shards = tick.world.worldProps.filter(p => p.type === "snake_shard");
        assert.ok(shards.length > 0);
    });
});
