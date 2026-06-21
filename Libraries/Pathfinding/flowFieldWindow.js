import { circleIntersectsAabb, createAabb } from "../Math/Aabb2D.js";
import {
    centeredGridFrameKey,
    createCenteredGridFrame,
    getCellBoundsInCenteredFrameInto,
    gridToWorldInCenteredFrame,
    setCenteredGridFrameCenter,
    worldToGridInCenteredFrame,
} from "../Spatial/grid/GridCoords.js";
import { gridReachabilityBfs } from "./gridReachabilityBfs.js";
import { snapshotWorldToGrid } from "./GridNavSnapshot.js";
export class FlowFieldWindow {
    constructor(cellSize, width, height) {
        this.frame = createCenteredGridFrame(cellSize, width, height);
        this.cellSize = this.frame.cellSize;
        this.width = this.frame.width;
        this.height = this.frame.height;
        this.cols = this.frame.cols;
        this.rows = this.frame.rows;
        this.navCols = 0;
        this.navRows = 0;
        this.topologyKey = "";
        this.ready = false;
        this.cellBounds = createAabb();
    }
    setCenter(centerX, centerY) {
        setCenteredGridFrameCenter(this.frame, centerX, centerY);
        return this;
    }
    invalidateTopology() {
        this.topologyKey = "";
        this.ready = false;
    }
    beginTopologySync(navCacheKey) {
        const key = `${navCacheKey}:${centeredGridFrameKey(this.frame)}`;
        if (key === this.topologyKey && this.ready) return false;
        this.topologyKey = key;
        this.ready = false;
        return true;
    }
    markReady() {
        this.ready = true;
    }
    rebuildFlowToNavMap(flowToNavIdx, navFrame) {
        const mapped = rebuildFlowToNavIdx(flowToNavIdx, this.frame, navFrame);
        this.navCols = mapped.navCols;
        this.navRows = mapped.navRows;
        return mapped;
    }
    isFlowCellBlocked(flowToNavIdx, navBlockedView, flowIdx) {
        return flowCellBlocked(flowToNavIdx, navBlockedView, flowIdx);
    }
    worldToGrid(x, y) {
        return worldToGridInCenteredFrame(this.frame, x, y);
    }
    containsWorldPoint(x, y) {
        const { col, row } = this.worldToGrid(x, y);
        return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    }
    gridToWorld(col, row) {
        return gridToWorldInCenteredFrame(this.frame, col, row);
    }
    getCellBounds(col, row) {
        return getCellBoundsInCenteredFrameInto(this.cellBounds, this.frame, col, row);
    }
    entityIntersectsCell(x, y, radius, col, row) {
        return circleIntersectsAabb(x, y, radius, this.getCellBounds(col, row));
    }
    flowRequest(targetX, targetY, range = 999999) {
        return FlowFieldRequest.fromWorld(this, targetX, targetY, range);
    }
    checkReachability(flowToNavIdx, navBlockedView, neighborGrid, startX, startY, targetX, targetY) {
        if (!this.ready || !navBlockedView) return false;
        const start = this.worldToGrid(startX, startY);
        const target = this.worldToGrid(targetX, targetY);
        if (start.col < 0 || start.col >= this.cols || start.row < 0 || start.row >= this.rows) return false;
        if (target.col < 0 || target.col >= this.cols || target.row < 0 || target.row >= this.rows) return false;
        const startIdx = start.row * this.cols + start.col;
        const targetIdx = target.row * this.cols + target.col;
        return gridReachabilityBfs(startIdx, targetIdx, (idx) => this.isFlowCellBlocked(flowToNavIdx, navBlockedView, idx), neighborGrid);
    }
}
export class FlowFieldRequest {
    constructor(targetCol, targetRow, targetIdx, range) {
        this.targetCol = targetCol;
        this.targetRow = targetRow;
        this.targetIdx = targetIdx;
        this.range = range;
    }
    static fromWorld(flowWindow, targetX, targetY, range = 999999) {
        const target = flowWindow.worldToGrid(targetX, targetY);
        if (target.col < 0 || target.col >= flowWindow.cols || target.row < 0 || target.row >= flowWindow.rows) return null;
        return new FlowFieldRequest(target.col, target.row, target.row * flowWindow.cols + target.col, range);
    }
    toWorkerPayload() {
        return { type: "updateFlow", tx: this.targetCol, ty: this.targetRow, range: this.range };
    }
}
export function rebuildFlowToNavIdx(flowToNavIdx, flowFrame, navFrame) {
    const flowSize = flowToNavIdx.length;
    const navCols = navFrame.cols;
    const navRows = navFrame.rows;
    const half = flowFrame.cellSize / 2;
    const wxBase = flowFrame.centerX - flowFrame.offsetX + half;
    const wyBase = flowFrame.centerY - flowFrame.offsetY + half;
    for (let idx = 0; idx < flowSize; idx++) {
        const col = idx % flowFrame.cols;
        const row = (idx / flowFrame.cols) | 0;
        const worldX = col * flowFrame.cellSize + wxBase;
        const worldY = row * flowFrame.cellSize + wyBase;
        const worldCell = snapshotWorldToGrid(navFrame, worldX, worldY);
        if (worldCell.col >= 0 && worldCell.col < navCols && worldCell.row >= 0 && worldCell.row < navRows) flowToNavIdx[idx] = worldCell.row * navCols + worldCell.col;
        else flowToNavIdx[idx] = -1;
    }
    return { navCols, navRows };
}
export function rebuildFlowNeighborGrid(flowToNavIdx, octilePredecessors, neighborGrid, flowSize, navCols, navRows) {
    const navToFlow = new Int32Array(navCols * navRows).fill(-1);
    for (let idx = 0; idx < flowSize; idx++) {
        const navIdx = flowToNavIdx[idx];
        if (navIdx >= 0) navToFlow[navIdx] = idx;
    }
    for (let idx = 0; idx < flowSize; idx++) {
        const navIdx = flowToNavIdx[idx];
        const base = idx * 8;
        if (navIdx < 0) {
            for (let i = 0; i < 8; i++) neighborGrid[base + i] = -1;
            continue;
        }
        const navBase = navIdx * 8;
        for (let i = 0; i < 8; i++) {
            const navPredIdx = octilePredecessors[navBase + i];
            neighborGrid[base + i] = navPredIdx >= 0 ? navToFlow[navPredIdx] : -1;
        }
    }
}
export function flowCellBlocked(flowToNavIdx, navBlocked, flowIdx) {
    const navIdx = flowToNavIdx[flowIdx];
    return navIdx < 0 || navBlocked[navIdx] !== 0;
}
