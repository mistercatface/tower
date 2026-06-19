import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSeededRng } from "../Libraries/Math/SeededRng.js";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { getPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { PUZZLE_TEMPLATE_BALL_TINTS } from "../Libraries/Color/tintPresets.js";
import { CORRIDOR_TYPE_CONVEYOR_ONE_WAY, CORRIDOR_TYPE_LOCKED_ROOM } from "../Libraries/RoomGraph/roomGraphCorridorTypes.js";
import { getRoomGraph, listRoomLinks, listRoomNodes } from "../Libraries/RoomGraph/roomGraphStore.js";
import { stampBeltCratePuzzleAt } from "../Libraries/RoomGraph/puzzleTemplateBeltCrate.js";
import { visitLiveWorldProps } from "../GameState/EntityRegistry.js";
import { createRoomBakeTestState } from "./lockedRoomHarness.js";

loadPropAssets();

function countBallsWithTint(state, tint) {
    let count = 0;
    visitLiveWorldProps(state.worldProps, (prop) => {
        if (prop.type !== "ball") return;
        if (getPropVisualTint(prop) === tint) count++;
    });
    return count;
}
function propInsideRoom(state, prop, room) {
    const grid = state.obstacleGrid;
    const { col, row } = grid.worldToGrid(prop.x, prop.y);
    return col >= room.col && col < room.col + room.width && row >= room.row && row < room.row + room.height;
}
describe("belt crate puzzle template", () => {
    it("stamps three rooms, fixed links, props in room A, and locked bake on B→C", () => {
        const state = createRoomBakeTestState(128, 96);
        const rng = createSeededRng(90210);
        let stamped = null;
        for (let originCol = 8; originCol <= 24 && !stamped; originCol += 8) stamped = stampBeltCratePuzzleAt(state, originCol, 8, 48, 40, rng);
        assert.ok(stamped, "expected puzzle stamp to succeed");
        assert.equal(listRoomNodes(state).length, 3);
        const links = listRoomLinks(state);
        assert.equal(links.length, 3);
        const byPair = (a, b) => links.find((link) => link.a === a && link.b === b);
        const linkAB = byPair(stamped.roomA.id, stamped.roomB.id);
        const linkBA = byPair(stamped.roomB.id, stamped.roomA.id);
        const linkBC = byPair(stamped.roomB.id, stamped.roomC.id);
        assert.ok(linkAB);
        assert.ok(linkBA);
        assert.ok(linkBC);
        assert.equal(linkAB.corridorType, CORRIDOR_TYPE_CONVEYOR_ONE_WAY);
        assert.equal(linkBA.corridorType, CORRIDOR_TYPE_CONVEYOR_ONE_WAY);
        assert.equal(linkBC.corridorType, CORRIDOR_TYPE_LOCKED_ROOM);
        const bakes = getRoomGraph(state).bakedLockedRooms ?? [];
        assert.equal(bakes.length, 1);
        assert.equal(bakes[0].linkId, linkBC.id);
        assert.equal(bakes[0].nodeId, stamped.roomB.id);
        assert.equal(countBallsWithTint(state, PUZZLE_TEMPLATE_BALL_TINTS.roomA), 1);
        assert.equal(countBallsWithTint(state, PUZZLE_TEMPLATE_BALL_TINTS.roomB), 1);
        const roomABalls = [];
        visitLiveWorldProps(state.worldProps, (prop) => {
            if (prop.type !== "ball") return;
            if (propInsideRoom(state, prop, stamped.roomA)) roomABalls.push(prop);
        });
        assert.equal(roomABalls.length, 2);
        assert.ok((getRoomGraph(state).bakedFloorBelts ?? []).length > 0, "expected belt corridors to bake floor belts");
    });
    it("rolls different room footprints on each stamp", () => {
        const rng = createSeededRng(4242);
        const layouts = [];
        for (let i = 0; i < 4; i++) {
            const state = createRoomBakeTestState(160, 120);
            const stamped = stampBeltCratePuzzleAt(state, 8, 8, 44, 36, rng);
            assert.ok(stamped);
            layouts.push(`${stamped.roomA.width}x${stamped.roomA.height},${stamped.roomB.width}x${stamped.roomB.height},${stamped.roomC.width}x${stamped.roomC.height}`);
        }
        assert.equal(new Set(layouts).size, layouts.length);
    });
});
