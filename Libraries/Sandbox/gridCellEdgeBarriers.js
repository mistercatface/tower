import { readCellEdgeBarrierMask, resolveEntityAgainstCellEdgeBarrier } from "../Spatial/grid/gridCellEdges.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
/** @param {object} state @param {object} entity */
export function resolveEntityCellEdgeBarriers(state, entity) {
    if (entity.isDead || !entity.strategy?.isPushable) return false;
    const grid = state.obstacleGrid;
    let moved = false;
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead || !readCellEdgeBarrierMask(prop)) return;
        if (resolveEntityAgainstCellEdgeBarrier(entity, prop, grid)) moved = true;
    });
    if (moved) wakePushableBody(entity);
    return moved;
}
