import { circleIntersectsAabb, createAabb } from "../Math/Aabb2D.js";
import {
    centeredGridFrameKey,
    createCenteredGridFrame,
    getCellBoundsInCenteredFrameInto,
    gridCenterXInCenteredFrame,
    gridCenterYInCenteredFrame,
    setCenteredGridFrameCenter,
    worldColInCenteredFrame,
    worldRowInCenteredFrame,
} from "../Spatial/grid/GridCoords.js";
import { snapshotWorldCol, snapshotWorldRow } from "./GridNavSnapshot.js";
import { OCTILE_NEIGHBOR_GRID_LAYOUT } from "./neighborGridLayout.js";
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
    worldCol(x) {
        return worldColInCenteredFrame(this.frame, x);
    }
    worldRow(y) {
        return worldRowInCenteredFrame(this.frame, y);
    }
    gridCenterX(col) {
        return gridCenterXInCenteredFrame(this.frame, col);
    }
    gridCenterY(row) {
        return gridCenterYInCenteredFrame(this.frame, row);
    }
    worldToGrid(x, y) {
        return { col: this.worldCol(x), row: this.worldRow(y) };
    }
    containsWorldPoint(x, y) {
        const col = this.worldCol(x);
        const row = this.worldRow(y);
        return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    }
    gridToWorld(col, row) {
        return { x: this.gridCenterX(col), y: this.gridCenterY(row) };
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
}
export class FlowFieldRequest {
    constructor(targetCol, targetRow, targetIdx, range) {
        this.targetCol = targetCol;
        this.targetRow = targetRow;
        this.targetIdx = targetIdx;
        this.range = range;
    }
    static fromWorld(flowWindow, targetX, targetY, range = 999999) {
        const targetCol = flowWindow.worldCol(targetX);
        const targetRow = flowWindow.worldRow(targetY);
        if (targetCol < 0 || targetCol >= flowWindow.cols || targetRow < 0 || targetRow >= flowWindow.rows) return null;
        return new FlowFieldRequest(targetCol, targetRow, targetRow * flowWindow.cols + targetCol, range);
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
        const navCol = snapshotWorldCol(navFrame, worldX);
        const navRow = snapshotWorldRow(navFrame, worldY);
        if (navCol >= 0 && navCol < navCols && navRow >= 0 && navRow < navRows) flowToNavIdx[idx] = navRow * navCols + navCol;
        else flowToNavIdx[idx] = -1;
    }
    return { navCols, navRows };
}
export function rebuildFlowNeighborGrid(flowToNavIdx, octilePredecessors, neighborGrid, flowSize, navCols, navRows, layout = OCTILE_NEIGHBOR_GRID_LAYOUT) {
    const navToFlow = new Int32Array(navCols * navRows).fill(-1);
    for (let idx = 0; idx < flowSize; idx++) {
        const navIdx = flowToNavIdx[idx];
        if (navIdx >= 0) navToFlow[navIdx] = idx;
    }
    for (let idx = 0; idx < flowSize; idx++) {
        const navIdx = flowToNavIdx[idx];
        if (navIdx < 0) {
            layout.clearCell(neighborGrid, idx);
            continue;
        }
        for (let i = 0; i < layout.directionCount; i++) {
            const navPredIdx = octilePredecessors[layout.cellOffset(navIdx, i)];
            neighborGrid[layout.cellOffset(idx, i)] = navPredIdx >= 0 ? navToFlow[navPredIdx] : -1;
        }
    }
}
export function flowCellBlocked(flowToNavIdx, navBlocked, flowIdx) {
    const navIdx = flowToNavIdx[flowIdx];
    return navIdx < 0 || navBlocked[navIdx] !== 0;
}
