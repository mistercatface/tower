import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createKineticTestTick, mockKineticCircle, resetMockKineticCircleIds } from "./harness/kineticTickHarness.js";
import { resolveKineticContactPassWithEffects } from "./harness/kineticContactHarness.js";
describe("red boid triangle player-impact shatter", () => {
    it("shatters the exploring red boid on high force impact from player boid", () => {
        resetMockKineticCircleIds(1);
        // Exploring red boid
        const redBoid = mockKineticCircle(100, 100, 4, 0, 0, {
            strategy: {
                fracture: {
                    mode: "circle",
                    minForce: 12,
                    opponentOnly: true,
                    excludeFactions: ["alpha"],
                    threatType: "boid_triangle"
                }
            }
        });
        redBoid.type = "boid_triangle";
        redBoid.alwaysExplore = true;
        redBoid.faction = "bravo";
        redBoid.visualOverride = { tint: "#ff3366" };
        // Player boid triangle moving fast towards it
        const playerBoid = mockKineticCircle(93, 100, 4, 200, 0, {
            strategy: {
                fracture: {
                    mode: "circle",
                    minForce: 12,
                    opponentOnly: true,
                    excludeFactions: ["alpha"],
                    threatType: "boid_triangle"
                }
            }
        });
        playerBoid.type = "boid_triangle";
        playerBoid.faction = "alpha";
        const tick = createKineticTestTick([redBoid, playerBoid]);
        // Resolve contacts with side effects
        resolveKineticContactPassWithEffects(tick);
        // Verify the red boid is dead and evicted
        assert.ok(redBoid.isDead);
        assert.ok(!tick.world.worldProps.includes(redBoid));
        // Verify player boid is still alive
        assert.ok(!playerBoid.isDead);
        // Verify debris shards are spawned and inherit the red boid's tint
        const shards = tick.world.worldProps.filter((p) => p.type === "snake_shard");
        assert.ok(shards.length > 0);
        for (const shard of shards) assert.equal(shard.visualOverride?.tint, "#ff3366");
    });
    it("does not shatter the red boid on low force impact from player boid", () => {
        resetMockKineticCircleIds(1);
        const redBoid = mockKineticCircle(100, 100, 4, 0, 0, {
            strategy: {
                fracture: {
                    mode: "circle",
                    minForce: 12,
                    opponentOnly: true,
                    excludeFactions: ["alpha"],
                    threatType: "boid_triangle"
                }
            }
        });
        redBoid.type = "boid_triangle";
        redBoid.alwaysExplore = true;
        redBoid.faction = "bravo";
        redBoid.visualOverride = { tint: "#ff3366" };
        // Slow player boid triangle
        const playerBoid = mockKineticCircle(93, 100, 4, 5, 0, {
            strategy: {
                fracture: {
                    mode: "circle",
                    minForce: 12,
                    opponentOnly: true,
                    excludeFactions: ["alpha"],
                    threatType: "boid_triangle"
                }
            }
        });
        playerBoid.type = "boid_triangle";
        playerBoid.faction = "alpha";
        const tick = createKineticTestTick([redBoid, playerBoid]);
        resolveKineticContactPassWithEffects(tick);
        // Verify the red boid is NOT dead/evicted
        assert.ok(!redBoid.isDead);
        assert.ok(tick.world.worldProps.includes(redBoid));
        // Verify no shards spawned
        const shards = tick.world.worldProps.filter((p) => p.type === "snake_shard");
        assert.equal(shards.length, 0);
    });
    it("does not shatter the red boid on high force impact from another exploring red boid", () => {
        resetMockKineticCircleIds(1);
        const redBoidTarget = mockKineticCircle(100, 100, 4, 0, 0, {
            strategy: {
                fracture: {
                    mode: "circle",
                    minForce: 12,
                    opponentOnly: true,
                    excludeFactions: ["alpha"],
                    threatType: "boid_triangle"
                }
            }
        });
        redBoidTarget.type = "boid_triangle";
        redBoidTarget.alwaysExplore = true;
        redBoidTarget.faction = "bravo";
        redBoidTarget.visualOverride = { tint: "#ff3366" };
        // Another exploring red boid moving fast
        const redBoidImpactor = mockKineticCircle(93, 100, 4, 200, 0, {
            strategy: {
                fracture: {
                    mode: "circle",
                    minForce: 12,
                    opponentOnly: true,
                    excludeFactions: ["alpha"],
                    threatType: "boid_triangle"
                }
            }
        });
        redBoidImpactor.type = "boid_triangle";
        redBoidImpactor.alwaysExplore = true;
        redBoidImpactor.faction = "bravo";
        const tick = createKineticTestTick([redBoidTarget, redBoidImpactor]);
        resolveKineticContactPassWithEffects(tick);
        // Verify neither red boid shatters
        assert.ok(!redBoidTarget.isDead);
        assert.ok(!redBoidImpactor.isDead);
        assert.ok(tick.world.worldProps.includes(redBoidTarget));
        assert.ok(tick.world.worldProps.includes(redBoidImpactor));
    });
});
