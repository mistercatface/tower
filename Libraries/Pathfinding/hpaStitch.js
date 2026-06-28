export class HpaPathStitcher {
    constructor(prep, tempLegsBuffer, tempLegsOffsets, tempLegsLengths, resolveRegionLeg, cols) {
        this.prep = prep;
        this.tempLegsBuffer = tempLegsBuffer;
        this.tempLegsOffsets = tempLegsOffsets;
        this.tempLegsLengths = tempLegsLengths;
        this.resolveRegionLeg = resolveRegionLeg;
        this.cols = cols;
    }
    stitch(abstractIdx, outCols, outRows) {
        if (!abstractIdx || !abstractIdx.length) return 0;
        let offset = 0;
        const lastLeg = abstractIdx.length - 1;
        for (let i = 0; i < lastLeg; i++) offset = this.appendLeg(outCols, outRows, offset, abstractIdx[i], abstractIdx[i + 1]);
        return offset;
    }
    appendLeg(outCols, outRows, offset, aIdx, bIdx) {
        const legKey = (aIdx << 16) | bIdx;
        let legOffset = this.tempLegsOffsets.get(legKey);
        let legLen = 0;
        let isTempLeg = true;
        if (legOffset !== undefined) legLen = this.tempLegsLengths.get(legKey);
        else if (aIdx < this.prep.nodeCount && bIdx < this.prep.nodeCount) {
            legLen = this.resolveRegionLeg(aIdx, bIdx);
            isTempLeg = false;
        }
        if (legLen > 0) {
            const start = offset === 0 ? 0 : 1;
            if (isTempLeg)
                for (let i = start; i < legLen; i++) {
                    const idx = this.tempLegsBuffer[legOffset + i];
                    outCols[offset] = idx % this.cols;
                    outRows[offset] = (idx / this.cols) | 0;
                    offset++;
                }
            else
                for (let i = start; i < legLen; i++) {
                    const idx = this.resolveRegionLeg.scratch[i];
                    outCols[offset] = idx % this.cols;
                    outRows[offset] = (idx / this.cols) | 0;
                    offset++;
                }
            return offset;
        }
        const { aCol, aRow, bCol, bRow } = this.endpointCells(aIdx, bIdx);
        if (offset === 0) {
            outCols[offset] = aCol;
            outRows[offset] = aRow;
            offset++;
        }
        outCols[offset] = bCol;
        outRows[offset] = bRow;
        offset++;
        return offset;
    }
    endpointCells(aIdx, bIdx) {
        const { nodeCol, nodeRow, nodeCount } = this.prep;
        const startCol = this.prep.startCol;
        const startRow = this.prep.startRow;
        const targetCol = this.prep.targetCol;
        const targetRow = this.prep.targetRow;
        const startTemp = nodeCount;
        const targetTemp = nodeCount + 1;
        const aCol = aIdx === startTemp ? startCol : aIdx === targetTemp ? targetCol : nodeCol[aIdx];
        const aRow = aIdx === startTemp ? startRow : aIdx === targetTemp ? targetRow : nodeRow[aIdx];
        const bCol = bIdx === startTemp ? startCol : bIdx === targetTemp ? targetCol : nodeCol[bIdx];
        const bRow = bIdx === startTemp ? startRow : bIdx === targetTemp ? targetRow : nodeRow[bIdx];
        return { aCol, aRow, bCol, bRow };
    }
}
export function stitchAbstractCellPath(abstractIdx, prep, tempLegsBuffer, tempLegsOffsets, tempLegsLengths, resolveRegionLeg, outCols, outRows, cols) {
    const stitcher = new HpaPathStitcher(prep, tempLegsBuffer, tempLegsOffsets, tempLegsLengths, resolveRegionLeg, cols);
    return stitcher.stitch(abstractIdx, outCols, outRows);
}
