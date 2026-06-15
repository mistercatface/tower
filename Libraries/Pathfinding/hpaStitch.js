/** @typedef {{ col: number, row: number }} GridCell */
/** @typedef {(aIdx: number, bIdx: number) => GridCell[] | null} HpaRegionLegResolver */
/**
 * @typedef {object} HpaReplanPrep
 * @property {number} startCol
 * @property {number} startRow
 * @property {number} targetCol
 * @property {number} targetRow
 * @property {number} nodeCount
 * @property {Int16Array | number[]} nodeCol
 * @property {Int16Array | number[]} nodeRow
 * @property {string[]} [nodeIds]
 */
/** @param {GridCell[]} fullPath @param {GridCell[]} leg */
export function appendCellLeg(fullPath, leg) {
    if (!leg.length) return;
    if (!fullPath.length) {
        for (let i = 0; i < leg.length; i++) fullPath.push(leg[i]);
        return;
    }
    for (let i = 1; i < leg.length; i++) fullPath.push(leg[i]);
}
/** @param {number} aIdx @param {number} bIdx @param {HpaReplanPrep} prep */
function abstractEndpointCells(aIdx, bIdx, prep) {
    const { nodeCol, nodeRow, startCol, startRow, targetCol, targetRow, nodeCount } = prep;
    const startTemp = nodeCount;
    const targetTemp = nodeCount + 1;
    const aCol = aIdx === startTemp ? startCol : aIdx === targetTemp ? targetCol : nodeCol[aIdx];
    const aRow = aIdx === startTemp ? startRow : aIdx === targetTemp ? targetRow : nodeRow[aIdx];
    const bCol = bIdx === startTemp ? startCol : bIdx === targetTemp ? targetCol : nodeCol[bIdx];
    const bRow = bIdx === startTemp ? startRow : bIdx === targetTemp ? targetRow : nodeRow[bIdx];
    return { aCol, aRow, bCol, bRow };
}
/**
 * @param {number} aIdx
 * @param {number} bIdx
 * @param {HpaReplanPrep} prep
 * @param {Map<string, GridCell[]>} tempLegs
 * @param {HpaRegionLegResolver} resolveRegionLeg
 */
export function resolveAbstractLegCells(aIdx, bIdx, prep, tempLegs, resolveRegionLeg) {
    let leg = tempLegs.get(`${aIdx},${bIdx}`);
    if (!leg && aIdx < prep.nodeCount && bIdx < prep.nodeCount) leg = resolveRegionLeg(aIdx, bIdx);
    if (leg) return leg;
    const { aCol, aRow, bCol, bRow } = abstractEndpointCells(aIdx, bIdx, prep);
    return [
        { col: aCol, row: aRow },
        { col: bCol, row: bRow },
    ];
}
/**
 * @param {number[]} abstractIdx
 * @param {HpaReplanPrep} prep
 * @param {Map<string, GridCell[]>} tempLegs
 * @param {number} legIndex
 * @param {GridCell[]} fullCellPath
 * @param {HpaRegionLegResolver} resolveRegionLeg
 */
export function appendAbstractLeg(abstractIdx, prep, tempLegs, legIndex, fullCellPath, resolveRegionLeg) {
    const leg = resolveAbstractLegCells(abstractIdx[legIndex], abstractIdx[legIndex + 1], prep, tempLegs, resolveRegionLeg);
    appendCellLeg(fullCellPath, leg);
}
/**
 * @param {number[]} abstractIdx
 * @param {HpaReplanPrep} prep
 * @param {Map<string, GridCell[]>} tempLegs
 * @param {number} legStart
 * @param {number} legEndExclusive
 * @param {HpaRegionLegResolver} resolveRegionLeg
 * @returns {GridCell[] | null}
 */
export function stitchAbstractLegRange(abstractIdx, prep, tempLegs, legStart, legEndExclusive, resolveRegionLeg) {
    if (!abstractIdx.length || legEndExclusive <= legStart) return null;
    const fullCellPath = [];
    const lastLeg = Math.min(legEndExclusive, abstractIdx.length - 1);
    for (let i = legStart; i < lastLeg; i++) appendAbstractLeg(abstractIdx, prep, tempLegs, i, fullCellPath, resolveRegionLeg);
    return fullCellPath.length ? fullCellPath : null;
}
/**
 * @param {number[]} abstractIdx
 * @param {HpaReplanPrep} prep
 * @param {Map<string, GridCell[]>} tempLegs
 * @param {HpaRegionLegResolver} resolveRegionLeg
 * @returns {GridCell[] | null}
 */
export function stitchAbstractCellPath(abstractIdx, prep, tempLegs, resolveRegionLeg) {
    return stitchAbstractLegRange(abstractIdx, prep, tempLegs, 0, abstractIdx.length - 1, resolveRegionLeg);
}
