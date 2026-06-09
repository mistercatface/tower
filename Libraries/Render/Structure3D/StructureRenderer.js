/** @typedef {import("../WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
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
    drawWallFace(ctx, seg, p1, p2, px, py, input, viewport, worldBounds, options = {}, cacheObj = null) {
        drawProjectedWallFace(ctx, p1, p2, px, py, getWallDamageColor(seg, 1.0), input.worldSurfaces, input.surfaceBake, viewport, worldBounds, {
            damageAlpha: getWallDamageAlpha(seg),
            textureEnabled: options.textureEnabled !== false,
            cacheObj,
            settings: this.settings,
            wallHeight: seg.wallHeight ?? getWallHeight(this.settings),
        });
    }
    drawWallSegmentFaces(ctx, seg, px, py, input, viewport, worldBounds, options = {}) {
        const edges = this.getSegmentEdges(seg);
        if (!seg.sharedEdges) seg.sharedEdges = [false, false, false, false];
        for (let i = 0; i < 4; i++) {
            if (seg.sharedEdges[i]) continue;
            const edge = edges[i];
            const viewX = edge.cx - px;
            const viewY = edge.cy - py;
            if (edge.outX * viewX + edge.outY * viewY >= 0) continue;
            this.drawWallFace(ctx, seg, edge[0], edge[1], px, py, input, viewport, worldBounds, options, edge);
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
        if (!wallIndex) return input.walls;
        const bounds = alignBoundsToHash(getViewQueryBounds(viewport, this.settings.viewQueryPadPx, input.canvasBounds), wallIndex.cellSize);
        return wallIndex.collectInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, this._wallQuery);
    }
}
