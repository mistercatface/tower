import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { getSandboxEntityMeta } from "../GameState/sandboxEntityMeta.js";
import { hasChainLinkBetween, findDistanceConstraintBetween } from "../Libraries/Sandbox/chainLinks.js";
import { fleeHornChainRestLength, fleeHornMountOffsetFromBallCenter } from "../Libraries/Props/fleeHornWedge.js";
import { getCirclePropRadius } from "../Libraries/Props/propScale.js";
import { spawnFleeAgent } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgent.js";
import { createFleeAgentInstance } from "../Libraries/Game/snake/fleeAgent/FleeAgentInstance.js";
import { createHornSatelliteInstance } from "../Libraries/Game/snake/hornSatellite/HornSatelliteInstance.js";
import { createSnakeGameHarnessState, wireSnakeTestGame, snakeGameNavWalkable } from "./harness/snakeGameHarness.js";
import { spawnFleeAgentsInScene } from "../Libraries/Game/snake/fleeAgent/spawnFleeAgentsInScene.js";
import { spawnFleeHornSatelliteForBall } from "../Libraries/Game/snake/hornSatellite/spawnFleeHornSatellite.js";

loadPropAssets();

describe("horn satellite species", () => {
    it("registers in snake game species map", async () => {
        const { SNAKE_GAME_SPECIES } = await import("../Libraries/Game/snake/species/index.js");
        assert.ok(SNAKE_GAME_SPECIES.has("horn_satellite"));
    });

    it("starts bound when spawned with mountBallId", async () => {
        resetKineticConstraintIds(13);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const { horn } = spawnFleeHornSatelliteForBall(state, pack.head, {
            spawnGroupId: pack.spawnGroupId,
            bodyRadius: 2,
            forwardDir: { x: 1, y: 0 },
            faction: pack.head.faction,
        });
        const hornInstance = createHornSatelliteInstance(state, { headId: horn.id, spawnGroupId: pack.spawnGroupId, mountBallId: pack.head.id });
        registerAgentInstance(snakeGame, "horn_satellite", hornInstance);
        hornInstance.start(state);
        hornInstance.tick(state, 16);
        assert.equal(hornInstance.intent.getMode(), "bound");
        assert.equal(hornInstance.mountBallId, pack.head.id);
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

    it("spawnFleeAgentsInScene pairs each flee ball with a linked horn", async () => {
        resetKineticConstraintIds(20);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2, boidCount: 1 });
        const agents = spawnFleeAgentsInScene(state, snakeGameNavWalkable(state));
        assert.equal(agents.length, 1);
        const { pack, horn } = agents[0];
        assert.equal(pack.head.type, "flee_ball");
        assert.equal(horn.type, "flee_wedge");
        assert.ok(hasChainLinkBetween(state, pack.head.id, horn.id));
        const link = findDistanceConstraintBetween(state, pack.head.id, horn.id);
        const hornConfig = getSnakeGameConfig().hornSatellite;
        const wedgeScale = hornConfig.wedgeScale ?? 1;
        const expectedRest = fleeHornChainRestLength(getCirclePropRadius(pack.head), wedgeScale, hornConfig.linkSlack);
        assert.equal(link.restLength, expectedRest);
    });

    it("spawn places horn ahead of ball along forward", async () => {
        resetKineticConstraintIds(21);
        const { state } = await createSnakeGameHarnessState();
        wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const hornConfig = getSnakeGameConfig().hornSatellite;
        const wedgeScale = hornConfig.wedgeScale ?? 1;
        const spacing = fleeHornMountOffsetFromBallCenter(2, wedgeScale);
        const { horn } = spawnFleeHornSatelliteForBall(state, pack.head, {
            spawnGroupId: pack.spawnGroupId,
            bodyRadius: 2,
            forwardDir: { x: 1, y: 0 },
            faction: pack.head.faction,
        });
        assert.ok(Math.abs(horn.x - pack.head.x - spacing) < 0.01, `horn.x=${horn.x}, expected=${pack.head.x + spacing}`);
        assert.ok(Math.abs(horn.y - pack.head.y) < 0.01, `horn.y=${horn.y}, expected=${pack.head.y}`);
    });

    it("bound state syncs horn facing from mount velocity", async () => {
        resetKineticConstraintIds(22);
        const { state } = await createSnakeGameHarnessState();
        const { snakeGame } = wireSnakeTestGame(state);
        applySnakeGameConfig({ startRadius: 2 });
        const pack = spawnFleeAgent(state, { col: 10, row: 10 });
        const { horn } = spawnFleeHornSatelliteForBall(state, pack.head, {
            spawnGroupId: pack.spawnGroupId,
            bodyRadius: 2,
            forwardDir: { x: 1, y: 0 },
            faction: pack.head.faction,
        });
        pack.head.vx = 50;
        pack.head.vy = 0;
        pack.head.facing = Math.PI / 2;
        const hornInstance = createHornSatelliteInstance(state, { headId: horn.id, spawnGroupId: pack.spawnGroupId, mountBallId: pack.head.id });
        registerAgentInstance(snakeGame, "horn_satellite", hornInstance);
        hornInstance.start(state);
        hornInstance.tick(state, 16);
        assert.ok(Math.abs(horn.facing) < 0.2, `expected horn facing +x, got ${horn.facing}`);
    });
});
