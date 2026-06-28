export class HpaPathStitcher {
    constructor(prep, tempLegsBuffer, tempLegsOffsets, tempLegsLengths, resolveRegionLeg, cols) {
        this.prep = prep;
        this.tempLegsBuffer = tempLegsBuffer;
        this.tempLegsOffsets = tempLegsOffsets;
        this.tempLegsLengths = tempLegsLengths;
        this.resolveRegionLeg = resolveRegionLeg;
        this.cols = cols;
    }
    stitch(abstractIdx, outIdx) {
        if (!abstractIdx || !abstractIdx.length) return 0;
        let offset = 0;
        const lastLeg = abstractIdx.length - 1;
        for (let i = 0; i < lastLeg; i++) offset = this.appendLeg(outIdx, offset, abstractIdx[i], abstractIdx[i + 1]);
        return offset;
    }
    appendLeg(outIdx, offset, aIdx, bIdx) {
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
            if (isTempLeg) for (let i = start; i < legLen; i++) outIdx[offset++] = this.tempLegsBuffer[legOffset + i];
            else for (let i = start; i < legLen; i++) outIdx[offset++] = this.resolveRegionLeg.scratch[i];
            return offset;
        }
        const { aCellIdx, bCellIdx } = this.endpointCells(aIdx, bIdx);
        if (offset === 0) outIdx[offset++] = aCellIdx;
        outIdx[offset++] = bCellIdx;
        return offset;
    }
    endpointCells(aIdx, bIdx) {
        const { nodeIdx, nodeCount } = this.prep;
        const startIdx = this.prep.startIdx;
        const targetIdx = this.prep.targetIdx;
        const startTemp = nodeCount;
        const targetTemp = nodeCount + 1;
        const aCellIdx = aIdx === startTemp ? startIdx : aIdx === targetTemp ? targetIdx : nodeIdx[aIdx];
        const bCellIdx = bIdx === startTemp ? startIdx : bIdx === targetTemp ? targetIdx : nodeIdx[bIdx];
        return { aCellIdx, bCellIdx };
    }
}
export function stitchAbstractCellPath(abstractIdx, prep, tempLegsBuffer, tempLegsOffsets, tempLegsLengths, resolveRegionLeg, outIdx, cols) {
    const stitcher = new HpaPathStitcher(prep, tempLegsBuffer, tempLegsOffsets, tempLegsLengths, resolveRegionLeg, cols);
    return stitcher.stitch(abstractIdx, outIdx);
}
