import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp } from "../Entities/WorldProp.js";
import { addWorldPropToState } from "../GameState/EntityRegistry.js";
import { PASSAGE_MODE } from "../Libraries/Spatial/grid/CellEdge.js";
import { setBoundary } from "../Libraries/Spatial/grid/boundaryOccupancy.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { cellToGlobalColRow } from "../Libraries/Spatial/grid/gridCellTopology.js";
import { addButtonLink } from "../Libraries/Sandbox/buttonLinks.js";
import { isButtonEntity } from "../Libraries/Sandbox/buttonInput.js";
import { resolveLockedRoomEgressLayout } from "../Libraries/RoomGraph/roomGraphLockedRoom.js";
import {
    assertLockedExitSealed,
    assertLockedRoomEgressPlacements,
    assertLockedRoomSealed,
    bakeLinkedLockedRoomFixture,
    createRoomBakeTestState,
    getLockedRoomBake,
    holdLockedRoomButton,
    refreshPassagePower,
    releaseLockedRoomButton,
} from "./lockedRoomHarness.js";
import { makeHorizontalFixture } from "./corridorHarness.js";
describe("locked room egress layout", () => {
    it("places power on the wall beside the mouth and forcefield on the exit edge", () => {
        const fixture = makeHorizontalFixture(8, 8, 8, 8, 8);
        const state = createRoomBakeTestState(128, 64);
        const { locked } = bakeLinkedLockedRoomFixture(state, fixture, 6);
        const bake = getLockedRoomBake(state, locked.id);
        assert.ok(bake?.egresses.length >= 1);
        assertLockedRoomEgressPlacements(state, bake);
        for (let i = 0; i < bake.egresses.length; i++) {
            const egress = bake.egresses[i];
            assert.notDeepEqual(egress.power, { col: egress.hole.c, row: egress.hole.r });
            assert.equal(egress.forcefield.col, egress.hole.c);
            assert.equal(egress.forcefield.row, egress.hole.r);
            assert.equal(egress.forcefield.side, egress.hole.side);
            assert.notEqual(egress.power.col, egress.mouth.col);
        }
    });
});
describe("locked room seals and unseals", () => {
    it("blocks every egress from room and corridor until the button is held, then re-seals on release", () => {
        const fixture = makeHorizontalFixture(8, 8, 8, 8, 8);
        const state = createRoomBakeTestState(128, 64);
        const { locked } = bakeLinkedLockedRoomFixture(state, fixture, 6);
        const bake = getLockedRoomBake(state, locked.id);
        assert.ok(bake?.egresses.length >= 1);
        const grid = state.obstacleGrid;
        assertLockedRoomSealed(grid, state.navigation.gridNavContext, bake, true, "idle");
        holdLockedRoomButton(state, bake.buttonId);
        refreshPassagePower(state);
        assertLockedRoomSealed(grid, state.navigation.gridNavContext, bake, false, "held");
        releaseLockedRoomButton(state, bake.buttonId);
        refreshPassagePower(state);
        assertLockedRoomSealed(grid, state.navigation.gridNavContext, bake, true, "released");
    });
    it("wires the baked button to wall-adjacent power cells only", () => {
        const fixture = makeHorizontalFixture(8, 8, 8, 8, 8);
        const state = createRoomBakeTestState(128, 64);
        const { locked } = bakeLinkedLockedRoomFixture(state, fixture, 6);
        const bake = getLockedRoomBake(state, locked.id);
        const button = state.entityRegistry.getLive(bake.buttonId);
        assert.ok(isButtonEntity(button));
        assert.equal(button.inputMode, "massHold");
        assert.equal(button.invert, true);
        assert.equal(button.buttonLinks.length, bake.egresses.length);
        const grid = state.obstacleGrid;
        for (let i = 0; i < bake.egresses.length; i++) {
            const { power } = bake.egresses[i];
            const { globalCol, globalRow } = cellToGlobalColRow(grid, power.col, power.row);
            const linked = button.buttonLinks.some((link) => link.type === "gridCell" && link.globalCol === globalCol && link.globalRow === globalRow);
            assert.equal(linked, true, `missing wire to power at (${power.col},${power.row})`);
        }
    });
});
describe("passage power inverted hold suppress", () => {
    it("de-energizes a wall-adjacent source and unseals the mouth forcefield while held", () => {
        const state = createRoomBakeTestState(32, 32);
        const grid = state.obstacleGrid;
        const node = { col: 8, row: 8, width: 8, height: 8, id: 0 };
        const hole = { c: 8, r: 12, side: 3 };
        const layout = resolveLockedRoomEgressLayout(node, hole);
        setBoundary(grid, layout.forcefield.col, layout.forcefield.row, layout.forcefield.side, { kind: "passage", mode: PASSAGE_MODE.Solid, allowedSide: layout.forcefield.side, powered: false });
        grid.floorStore.setPassagePowerSourceAtIdx(colRowToIndex(layout.power.col, layout.power.row, grid.cols), true);
        grid.edgeStore.recomputePassageEdgeCount();
        const { x, y } = grid.gridToWorld(14, 14);
        const button = new WorldProp(x, y, "button_floor", 0);
        button.inputMode = "massHold";
        button.invert = true;
        addWorldPropToState(state, button);
        const { globalCol, globalRow } = cellToGlobalColRow(grid, layout.power.col, layout.power.row);
        addButtonLink(state, button.id, { type: "gridCell", globalCol, globalRow });
        refreshPassagePower(state);
        assertLockedExitSealed(grid, state.navigation.gridNavContext, layout, true, "idle");
        holdLockedRoomButton(state, button.id);
        refreshPassagePower(state);
        assertLockedExitSealed(grid, state.navigation.gridNavContext, layout, false, "held");
    });
});
describe("locked room bake across corridor layouts", () => {
    const fixtures = [makeHorizontalFixture(8, 8, 8, 8, 8), makeHorizontalFixture(8, 8, 2, 12, 8)];
    for (const fixture of fixtures)
        it(`${fixture.name}: layout, seal, and unseal for every solved egress seed`, () => {
            let passed = false;
            for (let seed = 0; seed < 24; seed++) {
                const state = createRoomBakeTestState(128, 64);
                const { locked } = bakeLinkedLockedRoomFixture(state, fixture, seed);
                const bake = getLockedRoomBake(state, locked.id);
                if (!bake?.egresses.length) continue;
                assertLockedRoomEgressPlacements(state, bake);
                const grid = state.obstacleGrid;
                assertLockedRoomSealed(grid, state.navigation.gridNavContext, bake, true, `seed ${seed}`);
                holdLockedRoomButton(state, bake.buttonId);
                refreshPassagePower(state);
                assertLockedRoomSealed(grid, state.navigation.gridNavContext, bake, false, `seed ${seed} held`);
                passed = true;
                break;
            }
            assert.ok(passed, `no seed produced locked-room egress for ${fixture.name}`);
        });
});
