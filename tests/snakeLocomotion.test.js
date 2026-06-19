import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSnakeLocomotion, formatSnakeFsmDebug } from "../Libraries/Game/snake/snakeLocomotion.js";

function mockNavBehavior() {
    let targetCell = null;
    let targetWorld = null;
    let hasRoute = false;
    let replanPending = false;
    let replanCalls = 0;
    let setCalls = 0;
    return {
        behavior: {
            hasMoveTarget() {
                return targetWorld != null;
            },
            getTargetCell() {
                return targetCell;
            },
            needsNavRetry() {
                if (!targetWorld) return true;
                if (replanPending) return false;
                return !hasRoute;
            },
            replanMoveTarget() {
                replanCalls++;
            },
            getLocomotionStatus() {
                return { hasRoute, replanPending, stuckFrames: 2, pathLen: 5 };
            },
            setMoveTarget(_seeker, world) {
                setCalls++;
                targetWorld = world;
                targetCell = { col: Math.floor(world.x / 16), row: Math.floor(world.y / 16) };
            },
            clearMoveTarget() {
                targetWorld = null;
                targetCell = null;
            },
        },
        setHasRoute(value) {
            hasRoute = value;
        },
        setReplanPending(value) {
            replanPending = value;
        },
        getSetCalls() {
            return setCalls;
        },
        getReplanCalls() {
            return replanCalls;
        },
    };
}

function mockGrid() {
    return {
        gridToWorld(col, row) {
            return { x: col * 16 + 8, y: row * 16 + 8 };
        },
        worldToGrid(x, y) {
            return { col: Math.floor(x / 16), row: Math.floor(y / 16) };
        },
    };
}

describe("snakeLocomotion", () => {
    it("tickNav sets move target when destination changes", () => {
        const nav = mockNavBehavior();
        let activeId = null;
        const locomotion = createSnakeLocomotion(() => nav.behavior, () => ({ clearMoveTarget() {} }), (_id, behaviorId) => { activeId = behaviorId; }, "hpa");
        const grid = mockGrid();
        const seeker = { id: "head" };
        locomotion.setDestination(grid, 4, 6);
        locomotion.tickNav(seeker, {});
        assert.equal(nav.getSetCalls(), 1);
        assert.equal(activeId, "hpa");
        assert.deepEqual(locomotion.getDestination(), { col: 4, row: 6, world: { x: 72, y: 104 } });
    });

    it("tickNav replans when destination matches but route is missing", () => {
        const nav = mockNavBehavior();
        const locomotion = createSnakeLocomotion(() => nav.behavior, () => ({ clearMoveTarget() {} }), () => {}, "hpa");
        const grid = mockGrid();
        const seeker = { id: "head" };
        locomotion.setDestination(grid, 2, 3);
        locomotion.tickNav(seeker, {});
        nav.setHasRoute(true);
        assert.equal(nav.getReplanCalls(), 0);
        nav.setHasRoute(false);
        locomotion.tickNav(seeker, {});
        assert.equal(nav.getReplanCalls(), 1);
        assert.equal(nav.getSetCalls(), 1);
    });

    it("clearDestination clears nav target on tickNav", () => {
        const nav = mockNavBehavior();
        const locomotion = createSnakeLocomotion(() => nav.behavior, () => ({ clearMoveTarget() {} }), () => {}, "hpa");
        const grid = mockGrid();
        const seeker = { id: "head" };
        locomotion.setDestination(grid, 1, 1);
        locomotion.tickNav(seeker, {});
        locomotion.clearDestination();
        locomotion.tickNav(seeker, {});
        assert.equal(nav.behavior.hasMoveTarget(seeker), false);
    });

    it("formatSnakeFsmDebug renders mode, destination, and nav status", () => {
        const line = formatSnakeFsmDebug({ mode: "flee", destCell: { col: 12, row: 8 }, pathLen: 4, replanReason: "pending", vx: 0, vy: 0, lastTransition: "held_latch" });
        assert.match(line, /flee \| 12,8 \| plen=4 \| pending \| v=0.0 \| held_latch/);
    });
});
