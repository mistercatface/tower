import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGameLaunchQuery } from "../Libraries/Game/parseGameLaunchQuery.js";
import { GAME_LAUNCHERS, getGameLauncher } from "../Libraries/Game/gameLaunchers.js";
describe("parseGameLaunchQuery", () => {
    it("returns null when game param is absent", () => {
        assert.equal(parseGameLaunchQuery(""), null);
        assert.equal(parseGameLaunchQuery("?foo=1"), null);
    });
    it("returns the game id from the query string", () => {
        assert.equal(parseGameLaunchQuery("?game=puzzle"), "puzzle");
    });
});
describe("game launchers", () => {
    it("registers puzzle with expected start actions", () => {
        const launcher = getGameLauncher("puzzle");
        assert.equal(launcher.title, "Puzzle");
        assert.equal(launcher.hideEditor, true);
        assert.deepEqual(launcher.actions, ["stampBeltCratePuzzle", "focusBlueBall", "snapCameraToTarget", "fitPlayViewport"]);
    });
    it("throws for unknown ids", () => {
        assert.throws(() => getGameLauncher("missing"), /Unknown game launch id/);
    });
    it("includes puzzle in the registry map", () => {
        assert.ok(GAME_LAUNCHERS.puzzle);
    });
});
