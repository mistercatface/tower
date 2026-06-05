import { floorTileSettings } from "../../Config/Config.js";
import { drawBarrel, drawCrate, drawFireBarrel, drawCrateShard } from "./PropRecipes.js";
import { SpatialQuery } from "../../Spatial/World/SpatialQuery.js";
import { isFaceTowardViewer, CAMERA_HEIGHT } from "./math/CombatProjection.js";
import { drawProjectedWallFace, preloadProjectedWallFace, drawProjectedWallRoof } from "./WallFaceTexture.js";
import { TileWorkerCoordinator, wallGeometryView, wallSharedEdgesView, MAX_WALLS, STRIDE } from "../Floor/TileWorkerCoordinator.js";

const VIEW_QUERY_PAD = 48;

const PROP_RECIPES = { barrel: drawBarrel, fire_barrel: drawFireBarrel, crate: drawCrate, crate_shard: drawCrateShard };

export class Render3D {
    constructor() {
        this.lastWalls = null;
        this.lastWallCount = 0;
        this.sharedEdgesDirty = true;
        this._wallQuery = new SpatialQuery();
        this._visibleObjects = [];
        this._cachedWalls = [];
        this._lastQueryKey = null;
    }

    getSegmentEdges(seg) {
        if (seg._cachedEdges) return seg._cachedEdges;
        const cos = Math.cos(seg.angle);
        const sin = Math.sin(seg.angle);
        const hs = seg.size / 2;
        const corners = [
            { x: seg.x + -hs * cos - -hs * sin, y: seg.y + -hs * sin + -hs * cos },
            { x: seg.x + hs * cos - -hs * sin, y: seg.y + hs * sin + -hs * cos },
            { x: seg.x + hs * cos - hs * sin, y: seg.y + hs * sin + hs * cos },
            { x: seg.x + -hs * cos - hs * sin, y: seg.y + -hs * sin + hs * cos },
        ];
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
            edge.wallHeight = seg.wallHeight;
        }
        
        return seg._cachedEdges;
    }

    updateSharedEdges(state) {
        const walls = state.walls;
        if (walls !== this.lastWalls || walls.length !== this.lastWallCount || this.sharedEdgesDirty) {
            this.lastWalls = walls;
            this.lastWallCount = walls.length;
            this.sharedEdgesDirty = false;
            this._lastQueryKey = null;
            this.rebuildSharedEdgesAsync(state);
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

    drawWallFace(ctx, seg, p1, p2, px, py, state, viewport, options = {}, cacheObj = null) {
        const wallColor = this.getWallColor(seg, 1.0);
        const healthRatio = seg.health / seg.maxHealth;
        const damageAlpha = healthRatio < 1 ? (1 - healthRatio) * 0.45 : 0;
        const textureEnabled = options.textureEnabled !== false;
        drawProjectedWallFace(ctx, p1, p2, px, py, wallColor, state.floorTiles, state, {
            viewport,
            damageAlpha,
            textureEnabled,
            cacheObj,
            wallHeight: seg.wallHeight,
        });
    }

    drawWallSegmentFaces(ctx, seg, px, py, state, viewport, options = {}) {
        const edges = this.getSegmentEdges(seg);
        if (!seg.sharedEdges) seg.sharedEdges = [false, false, false, false];

        const wallHeight = seg.wallHeight ?? (floorTileSettings.wallVisualHeight ?? (CAMERA_HEIGHT - 10));

        // 1. Draw side faces
        for (let i = 0; i < 4; i++) {
            const isShared = seg.sharedEdges[i];
            if (isShared) continue;

            const edge = edges[i];
            const viewX = edge.cx - px;
            const viewY = edge.cy - py;
            if (edge.outX * viewX + edge.outY * viewY >= 0) continue;
            this.drawWallFace(ctx, seg, edge[0], edge[1], px, py, state, viewport, options, edge);
        }

        // 2. Draw the roof (top cap) if the wall height is finite
        if (wallHeight < CAMERA_HEIGHT) {
            const alpha = wallHeight / (CAMERA_HEIGHT - wallHeight);
            const baseCorners = [edges[0][0], edges[1][0], edges[2][0], edges[3][0]];
            const topCorners = baseCorners.map(c => {
                const dx = c.x - px;
                const dy = c.y - py;
                return {
                    x: c.x + dx * alpha,
                    y: c.y + dy * alpha
                };
            });

            const wallColor = this.getWallColor(seg, 1.08);
            const edgeObj = edges[0];
            drawProjectedWallRoof(ctx, topCorners, seg, wallColor, state, viewport, edgeObj);
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

    rebuildSharedEdgesAsync(state) {
        const walls = state.walls;
        const numWalls = Math.min(walls.length, MAX_WALLS);

        for (let i = 0; i < numWalls; i++) {
            const seg = walls[i];
            const offset = i * STRIDE;
            wallGeometryView[offset] = seg.x;
            wallGeometryView[offset + 1] = seg.y;
            wallGeometryView[offset + 2] = seg.angle;
            wallGeometryView[offset + 3] = seg.size;
            wallGeometryView[offset + 4] = seg.isDead ? 1 : 0;
            const wallHeight = seg.wallHeight ?? (floorTileSettings.wallVisualHeight ?? (CAMERA_HEIGHT - 10));
            wallGeometryView[offset + 5] = wallHeight;
            if (!seg.sharedEdges) {
                seg.sharedEdges = [false, false, false, false];
            }
        }

        this._sharedEdgeGen = (this._sharedEdgeGen || 0) + 1;
        const currentGen = this._sharedEdgeGen;

        TileWorkerCoordinator.requestSharedEdges(numWalls).then(() => {
            if (this._sharedEdgeGen !== currentGen) return;
            if (this.lastWalls !== state.walls) return;

            for (let i = 0; i < numWalls; i++) {
                const seg = walls[i];
                if (seg.isDead) continue;
                const flags = wallSharedEdgesView[i];
                seg.sharedEdges[0] = (flags & 1) !== 0;
                seg.sharedEdges[1] = (flags & 2) !== 0;
                seg.sharedEdges[2] = (flags & 4) !== 0;
                seg.sharedEdges[3] = (flags & 8) !== 0;
            }
        });
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
            seg._distSq = (seg.x - px) ** 2 + (seg.y - py) ** 2;
            visibleObjects.push(seg);
        }
        if (!fastNav && state.pickups) {
            for (let i = 0; i < state.pickups.length; i++) {
                const p = state.pickups[i];
                if (p.isDead || p.strategy?.renderMode !== "3d") continue;
                if (viewport && typeof p.isVisible === "function" && !p.isVisible(viewport)) continue;
                p._distSq = (p.x - px) ** 2 + (p.y - py) ** 2;
                visibleObjects.push(p);
            }
        }
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) {
            visibleObjects[i].draw3D(ctx, this, state, px, py, viewport, wallDrawOptions);
        }
        ctx.restore();
    }

    getPropRecipe(key) {
        return PROP_RECIPES[key];
    }
}

