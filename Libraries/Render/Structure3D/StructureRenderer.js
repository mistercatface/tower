/** @typedef {import("../WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */

import { getWallVisualHeight } from "../../WorldSurface/WorldSurfaceSettings.js";
import { getSegmentFootprintCorners } from "../../Spatial/geometry/WallGeometry.js";
import { SpatialQuery } from "../../Spatial/query/SpatialQuery.js";
import { alignBoundsToHash, getViewQueryBounds } from "../common/viewportUtils.js";
import { drawProjectedWallFace } from "./ProjectedWallDraw.js";
import { applySharedEdgeFlags, requestSharedEdgeSolve, writeWallGeometry } from "./SharedEdgeBridge.js";

export class StructureRenderer {
    /** @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings */
    constructor(settings) {
        this.settings = settings;
        this.lastWalls = null;
        this.lastWallCount = 0;
        this.sharedEdgesDirty = true;
        this._wallQuery = new SpatialQuery();
        this._cachedWalls = [];
        this._lastQueryKey = null;
    }

    getSegmentEdges(seg) {
        if (seg._cachedEdges) return seg._cachedEdges;
        const corners = getSegmentFootprintCorners(seg);
        seg._cachedEdges = [
            [corners[0], corners[1]],
            [corners[1], corners[2]],
            [corners[2], corners[3]],
            [corners[3], corners[0]],
        ];

        for (let i = 0; i < 4; i++) {
            const edge = seg._cachedEdges[i];
            const p1 = edge[0];
            const p2 = edge[1];
            edge.edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            edge.cx = (p1.x + p2.x) / 2;
            edge.cy = (p1.y + p2.y) / 2;
            edge.outX = edge.cx - seg.x;
            edge.outY = edge.cy - seg.y;
            edge.wallHeight = seg.wallHeight ?? getWallVisualHeight(this.settings);
        }

        return seg._cachedEdges;
    }

    updateSharedEdges(input) {
        const walls = input.walls;
        if (walls !== this.lastWalls || walls.length !== this.lastWallCount || this.sharedEdgesDirty) {
            this.lastWalls = walls;
            this.lastWallCount = walls.length;
            this.sharedEdgesDirty = false;
            this._lastQueryKey = null;
            this.rebuildSharedEdgesAsync(input);
        }
    }

    getWallColor(seg, darkenRatio = 1.0) {
        const baseR = 245;
        const baseG = 245;
        const baseB = 247;
        const healthRatio = Math.max(0, Math.round((seg.health / seg.maxHealth) * 10) / 10);
        const r = Math.floor((baseR + (244 - baseR) * (1 - healthRatio)) * darkenRatio);
        const g = Math.floor((baseG + (67 - baseG) * (1 - healthRatio)) * darkenRatio);
        const b = Math.floor((baseB + (54 - baseB) * (1 - healthRatio)) * darkenRatio);
        return `rgb(${r}, ${g}, ${b})`;
    }

    drawWallFace(ctx, seg, p1, p2, px, py, input, viewport, options = {}, cacheObj = null) {
        const wallColor = this.getWallColor(seg, 1.0);
        const healthRatio = seg.health / seg.maxHealth;
        const damageAlpha = healthRatio < 1 ? (1 - healthRatio) * 0.45 : 0;
        const textureEnabled = options.textureEnabled !== false;
        drawProjectedWallFace(ctx, p1, p2, px, py, wallColor, input.worldSurfaces, input.surfaceBake, {
            viewport,
            damageAlpha,
            textureEnabled,
            cacheObj,
            settings: this.settings,
            wallHeight: seg.wallHeight ?? getWallVisualHeight(this.settings),
        });
    }

    drawWallSegmentFaces(ctx, seg, px, py, input, viewport, options = {}) {
        const edges = this.getSegmentEdges(seg);
        if (!seg.sharedEdges) seg.sharedEdges = [false, false, false, false];

        for (let i = 0; i < 4; i++) {
            if (seg.sharedEdges[i]) continue;

            const edge = edges[i];
            const viewX = edge.cx - px;
            const viewY = edge.cy - py;
            if (edge.outX * viewX + edge.outY * viewY >= 0) continue;
            this.drawWallFace(ctx, seg, edge[0], edge[1], px, py, input, viewport, options, edge);
        }
    }

    drawExplosion(px, py, maxDist, input, targetCtx) {
        this.updateSharedEdges(input);
        const maxDistSq = maxDist * maxDist;
        const visibleWalls = [];
        const candidateWalls = input.wallSpatialIndex
            ? input.wallSpatialIndex.collectInBounds(px - maxDist, py - maxDist, px + maxDist, py + maxDist)
            : input.walls;
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
            this.drawWallSegmentFaces(targetCtx, seg, px, py, input, null);
        }
    }

    rebuildSharedEdgesAsync(input) {
        const walls = input.walls;
        const numWalls = writeWallGeometry(walls, this.settings);

        this._sharedEdgeGen = (this._sharedEdgeGen || 0) + 1;
        const currentGen = this._sharedEdgeGen;

        requestSharedEdgeSolve(numWalls).then(() => {
            if (this._sharedEdgeGen !== currentGen) return;
            if (this.lastWalls !== input.walls) return;
            applySharedEdgeFlags(walls, numWalls);
        });
    }

    collectVisibleWalls(input, viewport, px, py) {
        const wallIndex = input.wallSpatialIndex;
        if (!viewport || !wallIndex) {
            this._lastQueryKey = null;
            return wallIndex ? wallIndex.collectInBounds(px - 1600, py - 1600, px + 1600, py + 1600, this._wallQuery) : input.walls;
        }
        const bounds = alignBoundsToHash(
            getViewQueryBounds(viewport, px, py, this.settings.viewQueryPadPx),
            wallIndex.cellSize,
        );
        const cellSize = wallIndex.cellSize;
        const minCol = Math.floor(bounds.minX / cellSize);
        const maxCol = Math.floor((bounds.maxX - 1) / cellSize);
        const minRow = Math.floor(bounds.minY / cellSize);
        const maxRow = Math.floor((bounds.maxY - 1) / cellSize);
        const queryKey = `${minCol}|${minRow}|${maxCol}|${maxRow}|${input.walls.length}`;
        if (queryKey !== this._lastQueryKey) {
            this._lastQueryKey = queryKey;
            this._cachedWalls = wallIndex.collectInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, this._wallQuery);
        }
        return this._cachedWalls;
    }
}
