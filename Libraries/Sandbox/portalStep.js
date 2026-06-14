import { PASSAGE_MODE } from "../Spatial/grid/CellEdge.js";
import { portalAccessInitiatorCell, portalMouthAllowedSide } from "../Spatial/grid/portalAccess.js";
import { registerPassageStepHandler } from "../Spatial/grid/passageStep.js";
/**
 * Portal step blocking — mouth cell only when powered; solid both sides when unpowered.
 * @returns {boolean} true when the step is blocked
 */
export function portalPassageBlocksStepFrom(fromCol, fromRow, toCol, toRow, edge, ownerCol, ownerRow, ownerSide) {
    if (edge.powered !== true) return true;
    const allowed = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, portalMouthAllowedSide(edge, ownerSide));
    return fromCol !== allowed.col || fromRow !== allowed.row;
}
/** Wire portal step rules into the passage step registry. Idempotent with registerSandboxPassageHandlers. */
export function registerPortalPassageStepHandler() {
    registerPassageStepHandler(PASSAGE_MODE.Portal, (ctx) => {
        if (!ctx.directional) return true;
        return portalPassageBlocksStepFrom(ctx.fromCol, ctx.fromRow, ctx.toCol, ctx.toRow, ctx.edge, ctx.ownerCol, ctx.ownerRow, ctx.ownerSide);
    });
}
