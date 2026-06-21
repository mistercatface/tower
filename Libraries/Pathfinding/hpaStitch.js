export class HpaPathStitcher {
    constructor(prep, tempLegs, resolveRegionLeg) {
        this.prep = prep;
        this.tempLegs = tempLegs;
        this.resolveRegionLeg = resolveRegionLeg;
    }
    stitch(abstractIdx) {
        if (!abstractIdx || !abstractIdx.length) return null;
        return this.stitchLegRange(abstractIdx, 0, abstractIdx.length - 1);
    }
    stitchLegRange(abstractIdx, legStart, legEndExclusive) {
        if (!abstractIdx.length || legEndExclusive <= legStart) return null;
        const fullCellPath = [];
        const lastLeg = Math.min(legEndExclusive, abstractIdx.length - 1);
        for (let i = legStart; i < lastLeg; i++) {
            const leg = this.resolveLeg(abstractIdx[i], abstractIdx[i + 1]);
            this.appendLeg(fullCellPath, leg);
        }
        return fullCellPath.length ? fullCellPath : null;
    }
    resolveLeg(aIdx, bIdx) {
        let leg = this.tempLegs.get(`${aIdx},${bIdx}`);
        if (!leg && aIdx < this.prep.nodeCount && bIdx < this.prep.nodeCount) leg = this.resolveRegionLeg(aIdx, bIdx);
        if (leg) return leg;
        const { aCol, aRow, bCol, bRow } = this.endpointCells(aIdx, bIdx);
        return [
            { col: aCol, row: aRow },
            { col: bCol, row: bRow },
        ];
    }
    endpointCells(aIdx, bIdx) {
        const { nodeCol, nodeRow, startCol, startRow, targetCol, targetRow, nodeCount } = this.prep;
        const startTemp = nodeCount;
        const targetTemp = nodeCount + 1;
        const aCol = aIdx === startTemp ? startCol : aIdx === targetTemp ? targetCol : nodeCol[aIdx];
        const aRow = aIdx === startTemp ? startRow : aIdx === targetTemp ? targetRow : nodeRow[aIdx];
        const bCol = bIdx === startTemp ? startCol : bIdx === targetTemp ? targetCol : nodeCol[bIdx];
        const bRow = bIdx === startTemp ? startRow : bIdx === targetTemp ? targetRow : nodeRow[bIdx];
        return { aCol, aRow, bCol, bRow };
    }
    appendLeg(fullPath, leg) {
        if (!leg.length) return;
        if (!fullPath.length) {
            for (let i = 0; i < leg.length; i++) fullPath.push(leg[i]);
            return;
        }
        for (let i = 1; i < leg.length; i++) fullPath.push(leg[i]);
    }
}
export function stitchAbstractCellPath(abstractIdx, prep, tempLegs, resolveRegionLeg) {
    const stitcher = new HpaPathStitcher(prep, tempLegs, resolveRegionLeg);
    return stitcher.stitch(abstractIdx);
}
