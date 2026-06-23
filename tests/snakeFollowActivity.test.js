import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeAgentSession } from "../Libraries/Game/snake/snakeAgentSession.js";
import { isSnakeFollowableTarget, resolveSnakeAgentMode } from "../Libraries/Game/snake/snakeFollowActivity.js";

function stubAutosim(mode, targetId = null) {
    return { getMode: () => mode, getTargetId: () => targetId };
}

describe("snake follow activity", () => {
    it("resolveSnakeAgentMode reads autosim mode", () => {
        const session = createSnakeAgentSession({}, { registry: { aliveByHeadId: new Map() }, navWalkable: null, speciesById: new Map() });
        session.autosimsByHeadId.set(7, stubAutosim("seek_food", 3));
        assert.equal(resolveSnakeAgentMode(session, 7), "seek_food");
        assert.equal(resolveSnakeAgentMode(session, 8), null);
    });

    it("isSnakeFollowableTarget allows seek_prey and seek_food with a target", () => {
        applySnakeGameConfig();
        const session = createSnakeAgentSession({}, { registry: { aliveByHeadId: new Map() }, navWalkable: null, speciesById: new Map() });
        session.autosimsByHeadId.set(1, stubAutosim("seek_food", 10));
        session.autosimsByHeadId.set(2, stubAutosim("seek_prey", 11));
        assert.equal(isSnakeFollowableTarget(session, 1), true);
        assert.equal(isSnakeFollowableTarget(session, 2), true);
    });

    it("isSnakeFollowableTarget rejects explore, flee, and seek_ally", () => {
        applySnakeGameConfig();
        const session = createSnakeAgentSession({}, { registry: { aliveByHeadId: new Map() }, navWalkable: null, speciesById: new Map() });
        session.autosimsByHeadId.set(1, stubAutosim("explore", null));
        session.autosimsByHeadId.set(2, stubAutosim("flee", 5));
        session.autosimsByHeadId.set(3, stubAutosim("seek_ally", 6));
        assert.equal(isSnakeFollowableTarget(session, 1), false);
        assert.equal(isSnakeFollowableTarget(session, 2), false);
        assert.equal(isSnakeFollowableTarget(session, 3), false);
    });

    it("isSnakeFollowableTarget rejects active modes without a committed target", () => {
        applySnakeGameConfig();
        const session = createSnakeAgentSession({}, { registry: { aliveByHeadId: new Map() }, navWalkable: null, speciesById: new Map() });
        session.autosimsByHeadId.set(1, stubAutosim("seek_food", null));
        assert.equal(isSnakeFollowableTarget(session, 1), false);
    });
});
