/** @typedef {import("../WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
import { spatialWorldMargin } from "../../../Config/Config.js";
import { getWallHeight } from "../../WorldSurface/WorldSurfaceSettings.js";
import { getSegmentFootprintCorners } from "../../Spatial/geometry/WallGeometry.js";
import { SpatialQuery } from "../../Spatial/query/SpatialQuery.js";
import { alignBoundsToHash, getViewQueryBounds } from "../common/viewportUtils.js";
import { drawProjectedWallFace } from "./ProjectedWallDraw.js";
import { applySharedEdgeFlags, requestSharedEdgeSolve, writeWallGeometry } from "./SharedEdgeBridge.js";
import { getWallDamageAlpha, getWallDamageColor } from "./wallDamageVisual.js";
export class StructureRenderer {
    /** @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings */
    constructor(settings) {
        this.settings = settings;
        this.lastWalls = null;
        this.lastWallCount = 0;
        this.sharedEdgesDirty = true;
        this._wallQuery = new SpatialQuery();
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
            edge.wallHeight = seg.wallHeight ?? getWallHeight(this.settings);
        }
        return seg._cachedEdges;
    }
    updateSharedEdges(input) {
        const walls = input.walls;
        if (walls !== this.lastWalls || walls.length !== this.lastWallCount || this.sharedEdgesDirty) {
            this.lastWalls = walls;
            this.lastWallCount = walls.length;
            this.sharedEdgesDirty = false;
            this.rebuildSharedEdgesAsync(input);
        }
    }
    getWallColor(seg, darkenRatio = 1.0) {
        return getWallDamageColor(seg, darkenRatio);
    }
    drawWallFace(ctx, seg, p1, p2, px, py, input, viewport, options = {}, cacheObj = null) {
        const wallColor = getWallDamageColor(seg, 1.0);
        const damageAlpha = getWallDamageAlpha(seg);
        const textureEnabled = options.textureEnabled !== false;
        drawProjectedWallFace(ctx, p1, p2, px, py, wallColor, input.worldSurfaces, input.surfaceBake, {
            viewport,
            worldBounds: options.worldBounds,
            damageAlpha,
            textureEnabled,
            cacheObj,
            settings: this.settings,
            wallHeight: seg.wallHeight ?? getWallHeight(this.settings),
        });
    }
    drawWallSegmentFaces(ctx, seg, px, py, input, viewport, options = {}) {
        // In the new retained mode, we don't draw from simulation segments anymore.
        // This method is kept for backwards compatibility with explosions, but
        // the main draw loop will bypass this entirely.
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
        const candidateWalls = input.wallSpatialIndex ? input.wallSpatialIndex.collectInBounds(px - maxDist, py - maxDist, px + maxDist, py + maxDist) : input.walls;
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
        for (const seg of visibleWalls) this.drawWallSegmentFaces(targetCtx, seg, px, py, input, null);
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
            const margin = spatialWorldMargin;
            return wallIndex ? wallIndex.collectInBounds(px - margin, py - margin, px + margin, py + margin, this._wallQuery) : input.walls;
        }
        const bounds = alignBoundsToHash(getViewQueryBounds(viewport, this.settings.viewQueryPadPx, input.canvasBounds), wallIndex.cellSize);
        return wallIndex.collectInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, this._wallQuery);
    }
}
