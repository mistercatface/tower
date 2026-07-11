import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGameLaunchQuery, parseFractureLaunchSizePx, GAME_LAUNCHERS } from "../Libraries/Game/gameLaunch.js";

describe("parseGameLaunchQuery", () => {
    it("returns null when game param is absent", () => {
        assert.equal(parseGameLaunchQuery(""), null);
        assert.equal(parseGameLaunchQuery("?foo=1"), null);
    });
    it("returns the game id from the query string", () => {
        assert.equal(parseGameLaunchQuery("?game=snake"), "snake");
    });
});

describe("parseFractureLaunchSizePx", () => {
    it("defaults to 1024 when size is absent", () => {
        assert.equal(parseFractureLaunchSizePx("?game=glass"), 1024);
        assert.equal(parseFractureLaunchSizePx(""), 1024);
    });
    it("reads size as full side length in world px", () => {
        assert.equal(parseFractureLaunchSizePx("?game=glass&size=512"), 512);
        assert.equal(parseFractureLaunchSizePx("?size=256"), 256);
    });
    it("rejects non-positive sizes", () => {
        assert.throws(() => parseFractureLaunchSizePx("?size=0"), /invalid size/);
        assert.throws(() => parseFractureLaunchSizePx("?size=-10"), /invalid size/);
        assert.throws(() => parseFractureLaunchSizePx("?size=nope"), /invalid size/);
    });
});

describe("game launchers", () => {
    it("registers snake launcher configuration", () => {
        const launcher = GAME_LAUNCHERS.snake;
        assert.equal(launcher.title, "Snake");
        assert.equal(launcher.hideEditor, false);
        assert.equal(launcher.actions, undefined);
    });
});
