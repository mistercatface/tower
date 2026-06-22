import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { getSandboxEntityMeta } from "../GameState/sandboxEntityMeta.js";
import { hasChainLinkBetween } from "../Libraries/Sandbox/chainLinks.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { createHornSatelliteInstance } from "../Libraries/Game/snake/hornSatellite/HornSatelliteInstance.js";
import { createSnakeGameHarnessState, wireSnakeTestGame } from "./harness/snakeGameHarness.js";

loadPropAssets();

describe("horn satellite species", () => {
    it("registers in snake game species map", async () => {
        const { SNAKE_GAME_SPECIES } = await import("../Libraries/Game/snake/species/index.js");
        assert.ok(SNAKE_GAME_SPECIES.has("horn_satellite"));
    });

    it("seeks flee ball in spawn group and binds with chain link", async () => {
        resetKineticConstraintIds(11);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, hornSatellite: { acquireRange: 200, bindDistance: 40 } });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const fleeInstance = createFleeAgentInstance(state, { headId: pack.head.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "flee_agent", fleeInstance);
        fleeInstance.start(state);
        const horn = spawnPlacedSandboxProp(state, pack.head.x + 30, pack.head.y, "flee_wedge");
        const meta = getSandboxEntityMeta(state);
        meta.setSpawnGroupId(horn.id, pack.spawnGroupId);
        const hornInstance = createHornSatelliteInstance(state, { headId: horn.id, spawnGroupId: pack.spawnGroupId });
        registerAgentInstance(snakeGame, "horn_satellite", hornInstance);
        hornInstance.start(state);
        assert.equal(hornInstance.intent.getMode(), "seeking");
        for (let i = 0; i < 24; i++) {
            hornInstance.tick(state, 16);
            fleeInstance.tick(state, 16);
        }
        assert.equal(hornInstance.intent.getMode(), "bound");
        assert.equal(hornInstance.mountBallId, pack.head.id);
        assert.ok(hasChainLinkBetween(state, pack.head.id, horn.id));
        assert.equal(snakeGame.registry.aliveByHeadId.get(horn.id)?.species, "horn_satellite");
        assert.equal(snakeGame.registry.aliveByHeadId.get(pack.head.id)?.species, "flee_agent");
    });

    it("returns horn-only members for combat graph", async () => {
        resetKineticConstraintIds(12);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const horn = spawnPlacedSandboxProp(state, pack.head.x + 8, pack.head.y, "flee_wedge");
        const hornInstance = createHornSatelliteInstance(state, { headId: horn.id, spawnGroupId: pack.spawnGroupId });
        assert.deepEqual(hornInstance.syncMembers(state), [horn.id]);
    });
});
