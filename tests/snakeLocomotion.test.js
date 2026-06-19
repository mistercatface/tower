import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSnakeLocomotion, formatSnakeLocomotionDebug } from "../Libraries/Game/snake/snakeLocomotion.js";

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
    it("applyToNav sets move target when destination changes", () => {
        const nav = mockNavBehavior();
        let activeId = null;
        const locomotion = createSnakeLocomotion(() => nav.behavior, () => ({ clearMoveTarget() {} }), (_id, behaviorId) => { activeId = behaviorId; }, "hpa");
        const grid = mockGrid();
        const seeker = { id: "head" };
        locomotion.setDestination(grid, 4, 6);
        locomotion.applyToNav(seeker, {});
        assert.equal(nav.getSetCalls(), 1);
        assert.equal(activeId, "hpa");
        assert.deepEqual(locomotion.getDestination(), { col: 4, row: 6, world: { x: 72, y: 104 } });
    });

    it("applyToNav replans when destination matches but route is missing", () => {
        const nav = mockNavBehavior();
        const locomotion = createSnakeLocomotion(() => nav.behavior, () => ({ clearMoveTarget() {} }), () => {}, "hpa");
        const grid = mockGrid();
        const seeker = { id: "head" };
        locomotion.setDestination(grid, 2, 3);
        locomotion.applyToNav(seeker, {});
        nav.setHasRoute(true);
        assert.equal(nav.getReplanCalls(), 0);
        nav.setHasRoute(false);
        locomotion.applyToNav(seeker, {});
        assert.equal(nav.getReplanCalls(), 1);
        assert.equal(nav.getSetCalls(), 1);
    });

    it("clearDestination clears nav target on apply", () => {
        const nav = mockNavBehavior();
        const locomotion = createSnakeLocomotion(() => nav.behavior, () => ({ clearMoveTarget() {} }), () => {}, "hpa");
        const grid = mockGrid();
        const seeker = { id: "head" };
        locomotion.setDestination(grid, 1, 1);
        locomotion.applyToNav(seeker, {});
        locomotion.clearDestination();
        locomotion.applyToNav(seeker, {});
        assert.equal(nav.behavior.hasMoveTarget(seeker), false);
    });

    it("formatSnakeLocomotionDebug renders mode, destination, and nav status", () => {
        const line = formatSnakeLocomotionDebug("flee", { hasDest: true, destCol: 12, destRow: 8, pathLen: 4, stuckFrames: 0, replanPending: true });
        assert.match(line, /flee \| 12,8 \| plen=4 \| stuck=0 \| replan/);
    });
});
