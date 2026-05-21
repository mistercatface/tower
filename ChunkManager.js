export class ChunkManager {
    constructor() {
        this.chunkSize = 256;
        this.activeChunks = new Map();
        this.chunkPool = [];
        this.lastWallsRef = null;
        this.wallCache = new Map();
    }

    buildWallChunks(walls, theme) {
        for (const chunk of this.activeChunks.values()) {
            this.chunkPool.push(chunk);
        }
        this.activeChunks.clear();

        for (const wall of walls) {
            for (const seg of wall.segments) {
                seg.parentWall = wall;
                seg.chunks = [];

                const half = (seg.size * Math.SQRT2) / 2;
                const minCx = Math.floor((seg.x - half) / this.chunkSize);
                const maxCx = Math.floor((seg.x + half) / this.chunkSize);
                const minCy = Math.floor((seg.y - half) / this.chunkSize);
                const maxCy = Math.floor((seg.y + half) / this.chunkSize);

                for (let cx = minCx; cx <= maxCx; cx++) {
                    for (let cy = minCy; cy <= maxCy; cy++) {
                        const key = (cx & 0xffff) | ((cy & 0xffff) << 16);

                        let chunk = this.activeChunks.get(key);
                        if (!chunk) {
                            if (this.chunkPool.length > 0) {
                                chunk = this.chunkPool.pop();
                                chunk.x = cx * this.chunkSize;
                                chunk.y = cy * this.chunkSize;
                                chunk.segmentsCount = 0;
                            } else {
                                const offCanvas = new OffscreenCanvas(this.chunkSize, this.chunkSize);
                                chunk = { canvas: offCanvas, ctx: offCanvas.getContext("2d"), x: cx * this.chunkSize, y: cy * this.chunkSize, segments: [], segmentsCount: 0 };
                            }
                            chunk.isDirty = true;
                            this.activeChunks.set(key, chunk);
                        }
                        chunk.segments[chunk.segmentsCount++] = seg;
                        seg.chunks.push(chunk);
                    }
                }
            }
        }

        for (const chunk of this.activeChunks.values()) {
            if (chunk.isDirty) {
                this.updateChunk(chunk, theme);
                chunk.isDirty = false;
            }
        }
    }

    updateChunk(chunk, theme) {
        const ctx = chunk.ctx;
        ctx.clearRect(0, 0, this.chunkSize, this.chunkSize);

        const baseR = theme ? theme.r : 0;
        const baseG = theme ? theme.g : 188;
        const baseB = theme ? theme.b : 212;

        for (let i = 0; i < chunk.segmentsCount; i++) {
            const seg = chunk.segments[i];
            if (seg.isDead) continue;

            const healthRatio = Math.max(0, Math.round((seg.health / seg.maxHealth) * 10) / 10);
            const r = Math.floor(baseR + (244 - baseR) * (1 - healthRatio));
            const g = Math.floor(baseG + (67 - baseG) * (1 - healthRatio));
            const b = Math.floor(baseB + (54 - baseB) * (1 - healthRatio));

            const cacheKey = `${seg.size}_${r}_${g}_${b}`;

            let cachedSprite = this.wallCache.get(cacheKey);
            if (!cachedSprite) {
                cachedSprite = new OffscreenCanvas(seg.size + 2, seg.size + 2);
                const offCtx = cachedSprite.getContext("2d");

                offCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                offCtx.fillRect(1, 1, seg.size, seg.size);

                this.wallCache.set(cacheKey, cachedSprite);
            }

            ctx.save();
            ctx.globalAlpha = seg.parentWall.alpha;
            ctx.translate(seg.x - chunk.x, seg.y - chunk.y);
            ctx.rotate(seg.angle);

            ctx.drawImage(cachedSprite, -seg.size / 2 - 1, -seg.size / 2 - 1);
            ctx.restore();
        }
    }

    drawWalls(mainCtx, state) {
        const walls = state.walls;

        if (!walls || walls.length === 0) {
            for (const chunk of this.activeChunks.values()) {
                this.chunkPool.push(chunk);
            }
            this.activeChunks.clear();
            return;
        }

        if (this.lastWallsRef !== walls) {
            this.buildWallChunks(walls, state.theme);
            this.lastWallsRef = walls;
        }

        if (state.dirtySegments.size > 0) {
            for (const seg of state.dirtySegments) {
                if (seg.chunks) {
                    for (const chunk of seg.chunks) {
                        chunk.isDirty = true;
                    }
                }
            }
            state.dirtySegments.clear();
        }

        for (const chunk of this.activeChunks.values()) {
            if (chunk.isDirty) {
                this.updateChunk(chunk, state.theme);
                chunk.isDirty = false;
            }
            mainCtx.drawImage(chunk.canvas, chunk.x, chunk.y);
        }
    }
}