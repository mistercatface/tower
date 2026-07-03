import { FlatGraphView } from "./AStar.js";
import { octileDistanceIdx } from "../Spatial/grid/GridUtils.js";
export class HpaAbstractGraph extends FlatGraphView {
    constructor(nodeIdx, cols, edgeOffsets, edgeTargets, edgeCosts, nodeCount, edgeWrite, nodeIds) {
        super({ nodeIdx, cols, edgeOffsets, edgeTargets, edgeCosts, nodeCount, edgeWrite, nodeIds });
        this._candidateSeen = new Int32Array(nodeCount).fill(-1);
        this._candidateGen = -1;
    }
    collectTempConnectCandidates(centerIdx, isStart, maxCellsPerChunk, anchorRegionIdx) {
        const searchRadius = Math.ceil(Math.sqrt(maxCellsPerChunk)) * 2;
        const out = [];
        const seen = this._candidateSeen;
        const gen = ++this._candidateGen;
        const add = (idx) => {
            if (idx < 0 || idx >= this.nodeCount || seen[idx] === gen) return;
            seen[idx] = gen;
            out.push(idx);
        };
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
            const idx = this.nodeIdx[i];
            if (octileDistanceIdx(centerIdx, idx, this.cols) <= searchRadius) add(i);
        }
        return out;
    }
    buildExtended(startIdx, targetIdx, cols, prep, maxCellsPerChunk, resolveLegCost) {
        const startCandidates = this.collectTempConnectCandidates(startIdx, true, maxCellsPerChunk, prep.startRegion);
        const targetCandidates = this.collectTempConnectCandidates(targetIdx, false, maxCellsPerChunk, prep.targetRegion);
        const startTemp = this.nodeCount;
        const targetTemp = this.nodeCount + 1;
        const extCount = this.nodeCount + 2;
        const extNodeIdx = new Int32Array(extCount);
        extNodeIdx.set(this.nodeIdx);
        extNodeIdx[startTemp] = startIdx;
        extNodeIdx[targetTemp] = targetIdx;
        const targetConnectCost = new Int32Array(this.nodeCount);
        let currentOffset = 0;
        for (let i = 0; i < targetCandidates.length; i++) {
            const cIdx = targetCandidates[i];
            const legKey = (cIdx << 16) | targetTemp;
            const cNodeIdx = extNodeIdx[cIdx];
            const cost = resolveLegCost(cNodeIdx, targetIdx, legKey, currentOffset);
            if (cost > 0) {
                targetConnectCost[cIdx] = cost;
                currentOffset += cost;
            }
        }
        const startEdgesTarget = new Int32Array(startCandidates.length);
        const startEdgesCost = new Int32Array(startCandidates.length);
        let startEdgesCount = 0;
        for (let i = 0; i < startCandidates.length; i++) {
            const cIdx = startCandidates[i];
            const legKey = (startTemp << 16) | cIdx;
            const cNodeIdx = extNodeIdx[cIdx];
            const cost = resolveLegCost(startIdx, cNodeIdx, legKey, currentOffset);
            if (cost > 0) {
                startEdgesTarget[startEdgesCount] = cIdx;
                startEdgesCost[startEdgesCount] = cost;
                startEdgesCount++;
                currentOffset += cost;
            }
        }
        const extEdgeOffsets = new Int32Array(extCount + 1);
        extEdgeOffsets[0] = 0;
        for (let i = 0; i < this.nodeCount; i++) {
            const baseCount = this.edgeOffsets[i + 1] - this.edgeOffsets[i];
            const extraCount = targetConnectCost[i] > 0 ? 1 : 0;
            extEdgeOffsets[i + 1] = extEdgeOffsets[i] + baseCount + extraCount;
        }
        extEdgeOffsets[startTemp + 1] = extEdgeOffsets[startTemp] + startEdgesCount;
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
        for (let i = 0; i < startEdgesCount; i++) {
            extEdgeTargets[startWrite] = startEdgesTarget[i];
            extEdgeCosts[startWrite] = startEdgesCost[i];
            startWrite++;
        }
        const extendedGraph = new HpaAbstractGraph(extNodeIdx, cols, extEdgeOffsets, extEdgeTargets, extEdgeCosts, extCount, totalEdges, this.nodeIds);
        return { extendedGraph, startTemp, targetTemp };
    }
}
