export function createBehaviorGroundLocomotion(behaviorById, setActiveBehaviorId, navBehaviorId, directBehaviorId) {
    const navBehavior = () => behaviorById.get(navBehaviorId);
    const directBehavior = () => behaviorById.get(directBehaviorId);
    let dest = null;
    return {
        setExplore(agent, state, cell) {
            directBehavior().clearMoveTarget(agent);
            const world = state.obstacleGrid.gridToWorld(cell.col, cell.row);
            setActiveBehaviorId(agent.id, navBehaviorId);
            navBehavior().setMoveTarget(agent, world);
            dest = { col: cell.col, row: cell.row, world };
        },
        setSeek(agent, state, target) {
            directBehavior().clearMoveTarget(agent);
            setActiveBehaviorId(agent.id, navBehaviorId);
            navBehavior().setMoveTarget(agent, { x: target.x, y: target.y });
            const cell = state.obstacleGrid.worldToGrid(target.x, target.y);
            dest = { col: cell.col, row: cell.row, world: { x: target.x, y: target.y } };
        },
        setFlee() {},
        clearDestination(agent, state) {
            navBehavior().clearMoveTarget(agent);
            directBehavior().clearMoveTarget(agent);
            dest = null;
        },
        getDestination() {
            return dest;
        },
        needsRetry(agent, state) {
            return !this.hasMoveTarget(agent, state);
        },
        getStatus(_agent, _state) {
            return { hasRoute: dest != null, replanPending: false, stuckFrames: 0, pathLen: dest ? 1 : 0 };
        },
        tick() {},
        clear(agent, state) {
            this.clearDestination(agent, state);
        },
        hasArrivedAtDest(agent, grid) {
            if (!dest) return false;
            const cell = grid.worldToGrid(agent.x, agent.y);
            return cell.col === dest.col && cell.row === dest.row;
        },
        hasReachedDest() {
            return false;
        },
        retryOnRouteFailure() {
            return false;
        },
        hasMoveTarget(agent, state) {
            return navBehavior().hasMoveTarget(agent);
        },
    };
}
