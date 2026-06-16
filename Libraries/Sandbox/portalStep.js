import { PASSAGE_MODE } from "../Spatial/grid/CellEdge.js";
import { portalAccessInitiatorCell, portalMouthAllowedSide } from "../Spatial/grid/portalAccess.js";
import { registerPassageStepHandler } from "../Spatial/grid/passageStep.js";
import { isPassageEdgeOnPolicy } from "../Pathfinding/navPassagePolicySab.js";
/**
 * Portal step blocking — mouth cell only when on passage policy; solid when off-network.
 * @returns {boolean} true when the step is blocked
 */
export function portalPassageBlocksStepFrom(grid, fromCol, fromRow, toCol, toRow, edge, ownerCol, ownerRow, ownerSide) {
    if (!isPassageEdgeOnPolicy(grid, ownerCol, ownerRow, ownerSide)) return true;
    const allowed = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, portalMouthAllowedSide(edge, ownerSide));
    return fromCol !== allowed.col || fromRow !== allowed.row;
}
/** Wire portal step rules into the passage step registry. Idempotent with registerSandboxPassageHandlers. */
export function registerPortalPassageStepHandler() {
    registerPassageStepHandler(PASSAGE_MODE.Portal, (ctx) => {
        if (!ctx.directional) return true;
        return portalPassageBlocksStepFrom(ctx.grid, ctx.fromCol, ctx.fromRow, ctx.toCol, ctx.toRow, ctx.edge, ctx.ownerCol, ctx.ownerRow, ctx.ownerSide);
    });
}
