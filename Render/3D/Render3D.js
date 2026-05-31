import { THEME_COLORS } from "../../Config/Config.js";
import { createPropDrawContext } from "./PropDrawContext.js";
import { drawBarrel, drawCrate, drawFireBarrel } from "./PropRecipes.js";

const PROP_RECIPES = {
    barrel: drawBarrel,
    fire_barrel: drawFireBarrel,
    crate: drawCrate,
};

export class Render3D {
    constructor() {
        this.lastWalls = null;
        this.lastAliveCount = 0;
        this.sharedEdgesDirty = true;
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
        }
        return seg.edges;
    }

    updateSharedEdges(state) {
        const aliveCount = state.walls.reduce((acc, seg) => acc + (seg.isDead ? 0 : 1), 0);
        if (state.walls !== this.lastWalls || aliveCount !== this.lastAliveCount || this.sharedEdgesDirty) {
            this.lastWalls = state.walls;
            this.lastAliveCount = aliveCount;
            this.sharedEdgesDirty = false;
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

    drawProjectedFace(ctx, p1, p2, px, py, fillStyle, shouldStroke = false) {
        let angle1 = Math.atan2(p1.y - py, p1.x - px);
        let angle2 = Math.atan2(p2.y - py, p2.x - px);
        const cross = (p1.x - px) * (p2.y - py) - (p1.y - py) * (p2.x - px);
        const spread = 0.002;
        if (cross > 0) {
            angle1 -= spread;
            angle2 += spread;
        } else {
            angle1 += spread;
            angle2 -= spread;
        }
        const proj1X = p1.x + Math.cos(angle1) * 3000;
        const proj1Y = p1.y + Math.sin(angle1) * 3000;
        const proj2X = p2.x + Math.cos(angle2) * 3000;
        const proj2Y = p2.y + Math.sin(angle2) * 3000;
        
        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(proj1X, proj1Y);
        ctx.lineTo(proj2X, proj2Y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();
        if (shouldStroke) {
            ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
            ctx.lineWidth = 1.0;
            ctx.stroke();
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

            const wallColor = this.getWallColor(seg, THEME_COLORS[0], 0.5);
            const edges = this.getSegmentEdges(seg);

            if (!seg.sharedEdges) {
                seg.sharedEdges = [false, false, false, false];
            }

            for (let i = 0; i < 4; i++) {
                if (seg.sharedEdges[i]) continue;

                const p1 = edges[i][0];
                const p2 = edges[i][1];
                const edgeCx = (p1.x + p2.x) / 2;
                const edgeCy = (p1.y + p2.y) / 2;
                const outX = edgeCx - seg.x;
                const outY = edgeCy - seg.y;

                const viewX = edgeCx - px;
                const viewY = edgeCy - py;
                if (outX * viewX + outY * viewY >= 0) continue;

                this.drawProjectedFace(targetCtx, p1, p2, px, py, wallColor, false);
            }
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
                const p1 = edges[i][0];
                const p2 = edges[i][1];
                const edgeCx = (p1.x + p2.x) / 2;
                const edgeCy = (p1.y + p2.y) / 2;
                segmentEdges.push({
                    p1, p2,
                    cx: edgeCx, cy: edgeCy,
                    outX: edgeCx - seg.x, outY: edgeCy - seg.y,
                    seg,
                    edgeIndex: i
                });
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

    getViewQueryBounds(viewport, state) {
        const screenW = state.canvasBounds?.width ?? viewport.cx * 2;
        const screenH = state.canvasBounds?.height ?? viewport.cy * 2;
        const halfW = viewport.cx / viewport.zoom;
        const halfH = viewport.cy / viewport.zoom;
        const pad = Math.max(halfW, halfH) + 40;
        return viewport.getWorldBounds(screenW, screenH, pad);
    }

    clipToViewport(ctx, viewport, state) {
        const screenW = state.canvasBounds?.width ?? viewport.cx * 2;
        const screenH = state.canvasBounds?.height ?? viewport.cy * 2;
        const { minX, minY, maxX, maxY } = viewport.getWorldBounds(screenW, screenH, 0);
        ctx.beginPath();
        ctx.rect(minX, minY, maxX - minX, maxY - minY);
        ctx.clip();
    }

    draw3DBuildings(ctx, state, viewport) {
        const px = state.player.x;
        const py = state.player.y;

        this.updateSharedEdges(state);

        ctx.save();

        if (viewport) {
            this.clipToViewport(ctx, viewport, state);
        }

        const visibleObjects = [];
        let candidateWalls;

        if (viewport) {
            const { minX, minY, maxX, maxY } = this.getViewQueryBounds(viewport, state);
            candidateWalls = state.wallSpatialHash
                ? state.wallSpatialHash.collectInBounds(minX, minY, maxX, maxY)
                : state.walls;
        } else {
            candidateWalls = state.wallSpatialHash
                ? state.wallSpatialHash.collectInBounds(px - 1500, py - 1500, px + 1500, py + 1500)
                : state.walls;
        }

        for (let i = 0; i < candidateWalls.length; i++) {
            const seg = candidateWalls[i];
            if (seg.isDead) continue;
            const distSq = (seg.x - px) ** 2 + (seg.y - py) ** 2;
            seg._distSq = distSq;
            seg._renderType = "wall";
            visibleObjects.push(seg);
        }

        if (state.pickups) {
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
                const seg = obj;
                const wallColor = this.getWallColor(seg, THEME_COLORS[0], 1.0);
                const edges = this.getSegmentEdges(seg);

                if (!seg.sharedEdges) {
                    seg.sharedEdges = [false, false, false, false];
                }

                for (let i = 0; i < 4; i++) {
                    if (seg.sharedEdges[i]) continue;

                    const p1 = edges[i][0];
                    const p2 = edges[i][1];
                    const edgeCx = (p1.x + p2.x) / 2;
                    const edgeCy = (p1.y + p2.y) / 2;
                    const outX = edgeCx - seg.x;
                    const outY = edgeCy - seg.y;

                    const viewX = edgeCx - px;
                    const viewY = edgeCy - py;
                    if (outX * viewX + outY * viewY >= 0) continue;

                    this.drawProjectedFace(ctx, p1, p2, px, py, wallColor, true);
                }
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
