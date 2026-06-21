export class HpaAbstractGraph {
    constructor(nodeCol, nodeRow, edgeOffsets, edgeTargets, edgeCosts, nodeCount, edgeWrite, nodeIds) {
        this.nodeCol = nodeCol;
        this.nodeRow = nodeRow;
        this.edgeOffsets = edgeOffsets;
        this.edgeTargets = edgeTargets;
        this.edgeCosts = edgeCosts;
        this.nodeCount = nodeCount;
        this.edgeWrite = edgeWrite;
        this.nodeIds = nodeIds;
    }
    nearestNodeIdx(col, row) {
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < this.nodeCount; i++) {
            const d = Math.hypot(col - this.nodeCol[i], row - this.nodeRow[i]);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        return best;
    }
    collectTempConnectCandidates(gridCol, gridRow, isStart, maxCellsPerChunk) {
        const searchRadius = Math.ceil(Math.sqrt(maxCellsPerChunk)) * 2;
        const out = [];
        const seen = new Set();
        const add = (idx) => {
            if (idx < 0 || idx >= this.nodeCount || seen.has(idx)) return;
            seen.add(idx);
            out.push(idx);
        };
        const anchorRegionIdx = this.nearestNodeIdx(gridCol, gridRow);
        if (anchorRegionIdx >= 0) {
            add(anchorRegionIdx);
            if (isStart) {
                const edgeStart = this.edgeOffsets[anchorRegionIdx];
                const edgeEnd = this.edgeOffsets[anchorRegionIdx + 1];
                for (let e = edgeStart; e < edgeEnd; e++) add(this.edgeTargets[e]);
            } else
                for (let i = 0; i < this.nodeCount; i++) {
                    const edgeStart = this.edgeOffsets[i];
                    const edgeEnd = this.edgeOffsets[i + 1];
                    for (let e = edgeStart; e < edgeEnd; e++)
                        if (this.edgeTargets[e] === anchorRegionIdx) {
                            add(i);
                            break;
                        }
                }
            return out;
        }
        for (let i = 0; i < this.nodeCount; i++) {
            const d = Math.hypot(gridCol - this.nodeCol[i], gridRow - this.nodeRow[i]);
            if (d <= searchRadius) add(i);
        }
        return out;
    }
    buildExtended(startCol, startRow, targetCol, targetRow, maxCellsPerChunk, resolveLegCost) {
        const startCandidates = this.collectTempConnectCandidates(startCol, startRow, true, maxCellsPerChunk);
        const targetCandidates = this.collectTempConnectCandidates(targetCol, targetRow, false, maxCellsPerChunk);
        const startTemp = this.nodeCount;
        const targetTemp = this.nodeCount + 1;
        const extCount = this.nodeCount + 2;
        const extNodeCol = new Int16Array(extCount);
        const extNodeRow = new Int16Array(extCount);
        extNodeCol.set(this.nodeCol);
        extNodeRow.set(this.nodeRow);
        extNodeCol[startTemp] = startCol;
        extNodeRow[startTemp] = startRow;
        extNodeCol[targetTemp] = targetCol;
        extNodeRow[targetTemp] = targetRow;
        const tempLegs = new Map();
        const targetConnectCost = new Int32Array(this.nodeCount);
        for (let i = 0; i < targetCandidates.length; i++) {
            const cIdx = targetCandidates[i];
            const legKey = `${cIdx},${targetTemp}`;
            const { cost, path } = resolveLegCost(extNodeCol[cIdx], extNodeRow[cIdx], targetCol, targetRow, legKey);
            if (cost > 0) {
                targetConnectCost[cIdx] = cost;
                if (path) tempLegs.set(legKey, path);
            }
        }
        const startEdges = [];
        for (let i = 0; i < startCandidates.length; i++) {
            const cIdx = startCandidates[i];
            const legKey = `${startTemp},${cIdx}`;
            const { cost, path } = resolveLegCost(startCol, startRow, extNodeCol[cIdx], extNodeRow[cIdx], legKey);
            if (cost > 0) {
                startEdges.push({ targetIdx: cIdx, cost });
                if (path) tempLegs.set(legKey, path);
            }
        }
        const extEdgeOffsets = new Int32Array(extCount + 1);
        extEdgeOffsets[0] = 0;
        for (let i = 0; i < this.nodeCount; i++) {
            const baseCount = this.edgeOffsets[i + 1] - this.edgeOffsets[i];
            const extraCount = targetConnectCost[i] > 0 ? 1 : 0;
            extEdgeOffsets[i + 1] = extEdgeOffsets[i] + baseCount + extraCount;
        }
        extEdgeOffsets[startTemp + 1] = extEdgeOffsets[startTemp] + startEdges.length;
        extEdgeOffsets[targetTemp + 1] = extEdgeOffsets[targetTemp];
        const totalEdges = extEdgeOffsets[extCount];
        const extEdgeTargets = new Int16Array(totalEdges);
        const extEdgeCosts = new Uint16Array(totalEdges);
        for (let i = 0; i < this.nodeCount; i++) {
            let write = extEdgeOffsets[i];
            const baseStart = this.edgeOffsets[i];
            const baseEnd = this.edgeOffsets[i + 1];
            for (let e = baseStart; e < baseEnd; e++) {
                extEdgeTargets[write] = this.edgeTargets[e];
                extEdgeCosts[write] = this.edgeCosts[e];
                write++;
            }
            if (targetConnectCost[i] > 0) {
                extEdgeTargets[write] = targetTemp;
                extEdgeCosts[write] = targetConnectCost[i];
                write++;
            }
        }
        let startWrite = extEdgeOffsets[startTemp];
        for (let i = 0; i < startEdges.length; i++) {
            extEdgeTargets[startWrite] = startEdges[i].targetIdx;
            extEdgeCosts[startWrite] = startEdges[i].cost;
            startWrite++;
        }
        const extendedGraph = new HpaAbstractGraph(extNodeCol, extNodeRow, extEdgeOffsets, extEdgeTargets, extEdgeCosts, extCount, totalEdges, this.nodeIds);
        return { extendedGraph, startTemp, targetTemp, tempLegs };
    }
}
