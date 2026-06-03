import { THEME_COLORS, floorTileSettings } from "../../Config/Config.js";
import { createPropDrawContext } from "./PropDrawContext.js";
import { drawBarrel, drawCrate, drawFireBarrel, drawCrateShard } from "./PropRecipes.js";
import { SpatialQuery } from "../../Spatial/World/SpatialQuery.js";
import { isFaceTowardViewer } from "./math/CombatProjection.js";
import { drawProjectedWallFace } from "./WallFaceTexture.js";

const VIEW_QUERY_PAD = 48;

const PROP_RECIPES = { barrel: drawBarrel, fire_barrel: drawFireBarrel, crate: drawCrate, crate_shard: drawCrateShard };

export class Render3D {
    constructor() {
        this.lastWalls = null;
        this.lastAliveCount = 0;
        this.sharedEdgesDirty = true;
        this._wallQuery = new SpatialQuery();
        this._visibleObjects = [];
        this._cachedWalls = [];
        this._lastQueryKey = null;
    }

    getSegmentEdges(seg) {
        if (!seg.edges) {
            const cos = Math.cos(seg.angle);
            const sin = Math.sin(seg.angle);
            const hs = seg.size / 2;
            const corners = [
                { x: seg.x + -hs * cos - -hs * sin, y: seg.y + -hs * sin + -hs * cos },
                { x: seg.x + hs * cos - -hs * sin, y: seg.y + hs * sin + -hs * cos },
                { x: seg.x + hs * cos - hs * sin, y: seg.y + hs * sin + hs * cos },
                { x: seg.x + -hs * cos - hs * sin, y: seg.y + -hs * sin + hs * cos },
            ];
            seg.edges = [
                [corners[0], corners[1]],
                [corners[1], corners[2]],
                [corners[2], corners[3]],
                [corners[3], corners[0]],
            ];
            for (let i = 0; i < 4; i++) {
                const edge = seg.edges[i];
                const p1 = edge[0];
                const p2 = edge[1];
                edge.edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                edge.cx = (p1.x + p2.x) / 2;
                edge.cy = (p1.y + p2.y) / 2;
                edge.outX = edge.cx - seg.x;
                edge.outY = edge.cy - seg.y;
            }
        }
        return seg.edges;
    }

    updateSharedEdges(state) {
        let aliveCount = 0;
        const walls = state.walls;
        const len = walls.length;
        for (let i = 0; i < len; i++) {
            if (!walls[i].isDead) aliveCount++;
        }
        if (walls !== this.lastWalls || aliveCount !== this.lastAliveCount || this.sharedEdgesDirty) {
            this.lastWalls = walls;
            this.lastAliveCount = aliveCount;
            this.sharedEdgesDirty = false;
            this._lastQueryKey = null;
            this.rebuildSharedEdges(state);
        }
    }

    getWallColor(seg, theme, darkenRatio = 1.0) {
        const activeTheme = seg.theme || theme;
        const baseR = activeTheme ? activeTheme.r : 0;
        const baseG = activeTheme ? activeTheme.g : 188;
        const baseB = activeTheme ? activeTheme.b : 212;
        const healthRatio = Math.max(0, Math.round((seg.health / seg.maxHealth) * 10) / 10);
        const r = Math.floor((baseR + (244 - baseR) * (1 - healthRatio)) * darkenRatio);
        const g = Math.floor((baseG + (67 - baseG) * (1 - healthRatio)) * darkenRatio);
        const b = Math.floor((baseB + (54 - baseB) * (1 - healthRatio)) * darkenRatio);
        return `rgb(${r}, ${g}, ${b})`;
    }

    drawWallFace(ctx, seg, p1, p2, px, py, state, viewport, options = {}, cacheObj = null) {
        const wallColor = this.getWallColor(seg, THEME_COLORS[0], 1.0);
        const healthRatio = seg.health / seg.maxHealth;
        const damageAlpha = healthRatio < 1 ? (1 - healthRatio) * 0.45 : 0;
        const textureEnabled = options.textureEnabled !== false;
        drawProjectedWallFace(ctx, p1, p2, px, py, wallColor, state.floorTiles, state, {
            viewport,
            damageAlpha,
            textureEnabled,
            cacheObj,
        });
    }

    drawWallSegmentFaces(ctx, seg, px, py, state, viewport, options = {}) {
        const edges = this.getSegmentEdges(seg);
        if (!seg.sharedEdges) seg.sharedEdges = [false, false, false, false];
        for (let i = 0; i < 4; i++) {
            if (seg.sharedEdges[i]) continue;
            const edge = edges[i];
            const viewX = edge.cx - px;
            const viewY = edge.cy - py;
            if (edge.outX * viewX + edge.outY * viewY >= 0) continue;
            this.drawWallFace(ctx, seg, edge[0], edge[1], px, py, state, viewport, options, edge);
        }
    }

    drawExplosion(px, py, maxDist, state, targetCtx) {
        this.updateSharedEdges(state);
        const maxDistSq = maxDist * maxDist;
        const visibleWalls = [];
        const candidateWalls = state.wallSpatialHash ? state.wallSpatialHash.collectInBounds(px - maxDist, py - maxDist, px + maxDist, py + maxDist) : state.walls;
        for (let i = 0; i < candidateWalls.length; i++) {
            const seg = candidateWalls[i];
            if (seg.isDead) continue;
            const distSq = (seg.x - px) ** 2 + (seg.y - py) ** 2;
            if (distSq <= maxDistSq) {
                seg._distSq = distSq;
                visibleWalls.push(seg);
            }
        }
        visibleWalls.sort((a, b) => b._distSq - a._distSq);
        for (const seg of visibleWalls) {
            this.drawWallSegmentFaces(targetCtx, seg, px, py, state, null);
        }
    }

    rebuildSharedEdges(state) {
        const activeWalls = [];
        for (const seg of state.walls) {
            if (seg.isDead) continue;
            seg.sharedEdges = [false, false, false, false];
            const edges = this.getSegmentEdges(seg);
            const segmentEdges = [];
            for (let i = 0; i < 4; i++) {
                const edge = edges[i];
                segmentEdges.push({ p1: edge[0], p2: edge[1], cx: edge.cx, cy: edge.cy, outX: edge.outX, outY: edge.outY, seg, edgeIndex: i });
            }
            activeWalls.push({ seg, edges: segmentEdges });
        }
        const grid = new Map();
        const cellSize = 5;
        const getBucketKey = (x, y) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
        for (const w of activeWalls) {
            for (const edge of w.edges) {
                const key = getBucketKey(edge.cx, edge.cy);
                if (!grid.has(key)) grid.set(key, []);
                grid.get(key).push(edge);
            }
        }
        const thresholdSq = 9.0;
        for (const w1 of activeWalls) {
            for (const e1 of w1.edges) {
                if (e1.seg.sharedEdges[e1.edgeIndex]) continue;
                const col = Math.floor(e1.cx / cellSize);
                const row = Math.floor(e1.cy / cellSize);
                let found = false;
                for (let r = -1; r <= 1 && !found; r++) {
                    for (let c = -1; c <= 1 && !found; c++) {
                        const key = `${col + c},${row + r}`;
                        const bucket = grid.get(key);
                        if (!bucket) continue;
                        for (const e2 of bucket) {
                            if (e1 === e2) continue;
                            const distSq = (e1.cx - e2.cx) ** 2 + (e1.cy - e2.cy) ** 2;
                            if (distSq < thresholdSq) {
                                e1.seg.sharedEdges[e1.edgeIndex] = true;
                                e2.seg.sharedEdges[e2.edgeIndex] = true;
                                found = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    getViewQueryBounds(viewport, px, py) {
        const halfW = viewport.cx / viewport.zoom;
        const halfH = viewport.cy / viewport.zoom;
        return { minX: px - halfW - VIEW_QUERY_PAD, minY: py - halfH - VIEW_QUERY_PAD, maxX: px + halfW + VIEW_QUERY_PAD, maxY: py + halfH + VIEW_QUERY_PAD };
    }

    alignBoundsToHash(bounds, cellSize) {
        return {
            minX: Math.floor(bounds.minX / cellSize) * cellSize,
            minY: Math.floor(bounds.minY / cellSize) * cellSize,
            maxX: Math.ceil(bounds.maxX / cellSize) * cellSize,
            maxY: Math.ceil(bounds.maxY / cellSize) * cellSize,
        };
    }

    collectVisibleWalls(state, viewport, px, py) {
        const hash = state.wallSpatialHash;
        if (!viewport || !hash) {
            this._lastQueryKey = null;
            return hash ? hash.collectInBounds(px - 1600, py - 1600, px + 1600, py + 1600, this._wallQuery) : state.walls;
        }
        const bounds = this.alignBoundsToHash(this.getViewQueryBounds(viewport, px, py), hash.cellSize);
        const cellSize = hash.cellSize;
        const minCol = Math.floor(bounds.minX / cellSize);
        const maxCol = Math.floor((bounds.maxX - 1) / cellSize);
        const minRow = Math.floor(bounds.minY / cellSize);
        const maxRow = Math.floor((bounds.maxY - 1) / cellSize);
        const queryKey = `${minCol}|${minRow}|${maxCol}|${maxRow}|${state.walls.length}`;
        if (queryKey !== this._lastQueryKey) {
            this._lastQueryKey = queryKey;
            this._cachedWalls = hash.collectInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, this._wallQuery);
        }
        return this._cachedWalls;
    }

    clipToViewport(ctx, viewport, state) {
        const screenW = state.canvasBounds?.width ?? viewport.cx * 2;
        const screenH = state.canvasBounds?.height ?? viewport.cy * 2;
        const { minX, minY, maxX, maxY } = viewport.getWorldBounds(screenW, screenH, 0);
        ctx.beginPath();
        ctx.rect(minX, minY, maxX - minX, maxY - minY);
        ctx.clip();
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} state
     * @param {import("../Viewport.js").Viewport | null} viewport
     * @param {{ fastNav?: boolean, textureEnabled?: boolean }} [options]
     *   fastNav — lighter pass for dev preview panning (no shared edges, pickups, or wall textures).
     */
    draw3DBuildings(ctx, state, viewport, options = {}) {
        const px = state.player.x;
        const py = state.player.y;
        const fastNav = options.fastNav === true;
        const wallDrawOptions = { textureEnabled: options.textureEnabled !== false && !fastNav };
        if (!fastNav) {
            this.updateSharedEdges(state);
        }
        ctx.save();
        if (viewport) this.clipToViewport(ctx, viewport, state);
        const visibleObjects = this._visibleObjects;
        visibleObjects.length = 0;
        const candidateWalls = this.collectVisibleWalls(state, viewport, px, py);
        for (let i = 0; i < candidateWalls.length; i++) {
            const seg = candidateWalls[i];
            if (seg.isDead) continue;
            const distSq = (seg.x - px) ** 2 + (seg.y - py) ** 2;
            seg._distSq = distSq;
            seg._renderType = "wall";
            visibleObjects.push(seg);
        }
        if (!fastNav && state.pickups) {
            for (let i = 0; i < state.pickups.length; i++) {
                const p = state.pickups[i];
                if (p.isDead || p.strategy?.renderMode !== "3d") continue;
                if (viewport && typeof p.isVisible === "function" && !p.isVisible(viewport)) continue;
                const distSq = (p.x - px) ** 2 + (p.y - py) ** 2;
                p._distSq = distSq;
                p._renderType = p.getRender3DKey();
                visibleObjects.push(p);
            }
        }
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (const obj of visibleObjects) {
            if (obj._renderType === "wall") {
                this.drawWallSegmentFaces(ctx, obj, px, py, state, viewport, wallDrawOptions);
            } else {
                ctx.save();
                const pc = createPropDrawContext(obj, px, py);
                const draw = PROP_RECIPES[obj._renderType];
                if (draw) draw(ctx, pc);
                ctx.restore();
            }
        }
        ctx.restore();
    }
}
