import { worldToChunkCol, worldToChunkRow } from "../../Spatial/grid/ChunkGrid.js";
export class RenderChunk {
    constructor(col, row) {
        this.col = col;
        this.row = row;
        this.renderables = [];
    }
    add(renderable) {
        this.renderables.push(renderable);
    }
    clear() {
        this.renderables.length = 0;
    }
    draw(ctx, viewport, pass) {
        for (let i = 0; i < this.renderables.length; i++) {
            const r = this.renderables[i];
            if (r.pass === pass) r.draw(ctx, viewport);
        }
    }
}
export class RenderScene {
    constructor(chunkSizePx) {
        this.chunkSizePx = chunkSizePx;
        this.gridMinX = 0;
        this.gridMinY = 0;
        this.chunks = new Map();
        this.passDedup = new Set();
        this.passCollectBuffer = [];
    }
    setGridOrigin(gridMinX, gridMinY) {
        this.gridMinX = gridMinX;
        this.gridMinY = gridMinY;
    }
    _getChunkKey(col, row) {
        return `${col},${row}`;
    }
    getChunk(col, row) {
        const key = this._getChunkKey(col, row);
        let chunk = this.chunks.get(key);
        if (!chunk) {
            chunk = new RenderChunk(col, row);
            this.chunks.set(key, chunk);
        }
        return chunk;
    }
    clear() {
        this.chunks.clear();
    }
    removeBySourceId(sourceId) {
        for (const chunk of this.chunks.values()) for (let i = chunk.renderables.length - 1; i >= 0; i--) if (chunk.renderables[i].sourceId === sourceId) chunk.renderables.splice(i, 1);
    }
    insert(renderable) {
        const bounds = renderable.bounds;
        const minCol = worldToChunkCol(bounds.minX, this.gridMinX, this.chunkSizePx);
        const maxCol = worldToChunkCol(bounds.maxX, this.gridMinX, this.chunkSizePx);
        const minRow = worldToChunkRow(bounds.minY, this.gridMinY, this.chunkSizePx);
        const maxRow = worldToChunkRow(bounds.maxY, this.gridMinY, this.chunkSizePx);
        for (let r = minRow; r <= maxRow; r++) for (let c = minCol; c <= maxCol; c++) this.getChunk(c, r).add(renderable);
    }
    collectPass(pass, minCol, minRow, maxCol, maxRow, outArray) {
        const out = outArray ?? this.passCollectBuffer;
        out.length = 0;
        this.passDedup.clear();
        for (let r = minRow; r <= maxRow; r++)
            for (let c = minCol; c <= maxCol; c++) {
                const key = this._getChunkKey(c, r);
                const chunk = this.chunks.get(key);
                if (chunk)
                    for (let i = 0; i < chunk.renderables.length; i++) {
                        const renderable = chunk.renderables[i];
                        if (renderable.pass === pass && !this.passDedup.has(renderable)) {
                            this.passDedup.add(renderable);
                            out.push(renderable);
                        }
                    }
            }
        return out;
    }
    drawPass(ctx, viewport, pass, minCol, minRow, maxCol, maxRow) {
        for (let r = minRow; r <= maxRow; r++)
            for (let c = minCol; c <= maxCol; c++) {
                const key = this._getChunkKey(c, r);
                const chunk = this.chunks.get(key);
                if (chunk) chunk.draw(ctx, viewport, pass);
            }
    }
}
