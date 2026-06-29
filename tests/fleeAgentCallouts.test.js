import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { events } from "../Core/EventSystem.js";
import { FLOATING_TEXT_SPAWN_EVENT } from "../Libraries/Render/FloatingText.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/AgentProfiles.js";
import { getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { FleeAgentCalloutDirector, AgentCalloutCatalog } from "../Libraries/Game/snake/snakeAgentSession.js";

function calloutConfig(overrides = {}) {
    return {
        enabled: true,
        profileIds: ["flee_agent"],
        agentCooldownMs: 0,
        maxPerSecond: 10,
        preferOnScreen: false,
        color: "#fff",
        duration: 1000,
        yOffset: -14,
        topicCooldownMs: { falling_back: 0, engaging: 0, reloading: 0, enemy_spotted: 0 },
        topics: {
            falling_back: { priority: 70, phrases: ["falling back!", "oh crap!", "nope!"] },
            engaging: { priority: 80, phrases: ["engaging!", "fire!"] },
            reloading: { priority: 100, phrases: ["reloading!", "mag out!"] },
            enemy_spotted: { priority: 90, phrases: ["enemy spotted!", "contact!"] },
        },
        ...overrides,
    };
}

function mockInstance({ profileId = AGENT_PROFILE.flee, headId = 1, mode = "explore", combatPhase = "idle", decisionContext = null } = {}) {
    return {
        profileId,
        headId,
        head: { id: headId, x: 10, y: 20, radius: 4 },
        combatAction: { phase: combatPhase },
        intent: {
            getMode: () => mode,
            getDecisionContext: () => decisionContext,
        },
    };
}

function mockGameState() {
    return { sandbox: {}, viewport: { circleInBounds: () => true } };
}

describe("flee agent callouts", () => {
    let emitted = [];
    let handler = null;

    beforeEach(() => {
        emitted = [];
        handler = (payload) => emitted.push(payload);
        events.on(FLOATING_TEXT_SPAWN_EVENT, handler);
    });

    afterEach(() => {
        if (handler) events.off(FLOATING_TEXT_SPAWN_EVENT, handler);
    });

    it("AgentCalloutCatalog picks from phrase pool via seeded rng", () => {
        const catalog = new AgentCalloutCatalog(calloutConfig());
        const rng = () => 0.99;
        assert.equal(catalog.pickPhrase("falling_back", rng), "nope!");
        assert.equal(catalog.pickPhrase("falling_back", () => 0), "falling back!");
    });

    it("emits on flee mode transition with phrase from pool", () => {
        const director = new FleeAgentCalloutDirector(calloutConfig(), () => 0.5);
        const state = mockGameState();
        const instance = mockInstance({ mode: "flee" });
        director.beginFrame(16);
        director.maybeEmit(state, instance);
        assert.equal(emitted.length, 1);
        assert.ok(["falling back!", "oh crap!", "nope!"].includes(emitted[0].text));
        assert.equal(emitted[0].variant, "custom");
    });

    it("does not emit every tick when mode is stable", () => {
        const director = new FleeAgentCalloutDirector(calloutConfig(), () => 0);
        const state = mockGameState();
        const instance = mockInstance({ mode: "explore" });
        director.beginFrame(16);
        director.maybeEmit(state, instance);
        director.beginFrame(16);
        director.maybeEmit(state, instance);
        assert.equal(emitted.length, 0);
    });

    it("emits on entering reloading phase", () => {
        const director = new FleeAgentCalloutDirector(calloutConfig(), () => 0);
        const state = mockGameState();
        const instance = mockInstance({ mode: "shoot_enemy", combatPhase: "reloading" });
        director.beginFrame(16);
        director.maybeEmit(state, instance);
        assert.equal(emitted.length, 1);
        assert.equal(emitted[0].text, "reloading!");
    });

    it("emits enemy_spotted when visible enemy appears in LOS", () => {
        const director = new FleeAgentCalloutDirector(calloutConfig(), () => 0);
        const state = mockGameState();
        const decisionContext = {
            combatState: { visibleEnemy: { id: 99 }, hasLineOfSight: true },
            visible: { enemy: { id: 99 } },
        };
        const instance = mockInstance({ mode: "explore", decisionContext });
        director.beginFrame(16);
        director.maybeEmit(state, instance);
        assert.equal(emitted.length, 1);
        assert.equal(emitted[0].text, "enemy spotted!");
    });

    it("skips non-flee_agent profiles", () => {
        const director = new FleeAgentCalloutDirector(calloutConfig(), () => 0);
        const state = mockGameState();
        const instance = mockInstance({ profileId: AGENT_PROFILE.snake, mode: "flee" });
        director.beginFrame(16);
        director.maybeEmit(state, instance);
        assert.equal(emitted.length, 0);
    });

    it("global budget suppresses excess callouts in the same second", () => {
        const director = new FleeAgentCalloutDirector(calloutConfig({ maxPerSecond: 1, agentCooldownMs: 0 }), () => 0);
        const state = mockGameState();
        director.beginFrame(16);
        director.maybeEmit(state, mockInstance({ headId: 1, mode: "flee" }));
        director.maybeEmit(state, mockInstance({ headId: 2, mode: "flee" }));
        assert.equal(emitted.length, 1);
    });

    it("loads phrase pools from snake game config", () => {
        const cfg = getSnakeGameConfig().agentCallouts;
        assert.ok(cfg.topics.falling_back.phrases.includes("oh crap!"));
        assert.ok(cfg.topics.reloading.phrases.includes("reloading!"));
    });
});
