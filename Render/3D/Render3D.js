import { THEME_COLORS, wallTextureSettings } from "../../Config/Config.js";
import { createPropDrawContext } from "./PropDrawContext.js";
import { drawTree, drawBarrel, drawCrate, drawLampPost, drawFireBarrel } from "./PropRecipes.js";
import { getWallTextureCanvas } from "./WallTextures.js";
import { CAMERA_HEIGHT } from "./Projection3D.js";

const PROP_RECIPES = {
    tree: drawTree,
    barrel: drawBarrel,
    fire_barrel: drawFireBarrel,
    crate: drawCrate,
    lampPost: drawLampPost,
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

    computeProjectedFace(p1, p2, px, py, height = 40) {
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
        const dist1 = Math.hypot(p1.x - px, p1.y - py);
        const dist2 = Math.hypot(p2.x - px, p2.y - py);

        const clampedHeight = Math.min(height, CAMERA_HEIGHT - 10);
        const alpha = clampedHeight / (CAMERA_HEIGHT - clampedHeight);

        const proj1X = p1.x + Math.cos(angle1) * dist1 * alpha;
        const proj1Y = p1.y + Math.sin(angle1) * dist1 * alpha;
        const proj2X = p2.x + Math.cos(angle2) * dist2 * alpha;
        const proj2Y = p2.y + Math.sin(angle2) * dist2 * alpha;
        return { proj1X, proj1Y, proj2X, proj2Y };
    }

    traceProjectedFace(ctx, p1, p2, face) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(face.proj1X, face.proj1Y);
        ctx.lineTo(face.proj2X, face.proj2Y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
    }

    drawFaceTexture(ctx, p1, p2, face, textureCanvas, height = 40) {
        const { tileWorldSize } = wallTextureSettings;
        const texW = textureCanvas.width;
        const texH = textureCanvas.height;
        const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (edgeLen < 0.001) return;

        const edgeDirX = (p2.x - p1.x) / edgeLen;
        const edgeDirY = (p2.y - p1.y) / edgeLen;
        const uAlongEdge = p1.x * edgeDirX + p1.y * edgeDirY;
        const uPatternOffset = ((uAlongEdge / tileWorldSize) % 1 + 1) % 1 * texW;
        const verticalTiles = height / tileWorldSize;
        const vMax = verticalTiles * texH;

        // Subdivide the wall face into narrow slices (approx. 4 world units wide)
        const sliceWidthLimit = 4;
        const numSlices = Math.max(1, Math.ceil(edgeLen / sliceWidthLimit));

        const pattern = ctx.createPattern(textureCanvas, "repeat");

        for (let i = 0; i < numSlices; i++) {
            const t1 = i / numSlices;
            const t2 = (i + 1) / numSlices;

            // World coordinates for the top edge of this slice
            const ax = p1.x + t1 * (p2.x - p1.x);
            const ay = p1.y + t1 * (p2.y - p1.y);
            const bx = p1.x + t2 * (p2.x - p1.x);
            const by = p1.y + t2 * (p2.y - p1.y);

            // Linearly interpolate the projected bottom edge of this slice
            const projAx = face.proj1X + t1 * (face.proj2X - face.proj1X);
            const projAy = face.proj1Y + t1 * (face.proj2Y - face.proj1Y);
            const projBx = face.proj1X + t2 * (face.proj2X - face.proj1X);
            const projBy = face.proj1Y + t2 * (face.proj2Y - face.proj1Y);

            // Texture coordinates for this slice
            const u1 = uPatternOffset + t1 * (edgeLen / tileWorldSize) * texW;
            const u2 = uPatternOffset + t2 * (edgeLen / tileWorldSize) * texW;
            const du = u2 - u1;

            // --- Draw Triangle 1 (A, B, projA) ---
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.lineTo(projAx, projAy);
            ctx.closePath();
            ctx.clip();

            const a1 = (bx - ax) / du;
            const b1 = (by - ay) / du;
            const c1 = (projAx - ax) / vMax;
            const d1 = (projAy - ay) / vMax;
            const e1 = ax - a1 * u1;
            const f1 = ay - b1 * u1;

            const finalMatrix1 = new DOMMatrix([a1, b1, c1, d1, e1, f1]);
            pattern.setTransform(finalMatrix1);
            ctx.fillStyle = pattern;

            // Fill bounding box of Triangle 1 (padded by 1 to prevent seams)
            let minX = Math.min(ax, bx, projAx), maxX = Math.max(ax, bx, projAx);
            let minY = Math.min(ay, by, projAy), maxY = Math.max(ay, by, projAy);
            ctx.fillRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);
            ctx.restore();

            // --- Draw Triangle 2 (B, projB, projA) ---
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(projBx, projBy);
            ctx.lineTo(projAx, projAy);
            ctx.closePath();
            ctx.clip();

            const a2 = (projBx - projAx) / du;
            const b2 = (projBy - projAy) / du;
            const c2 = (projBx - bx) / vMax;
            const d2 = (projBy - by) / vMax;
            const e2 = bx - a2 * u2;
            const f2 = by - b2 * u2;

            const finalMatrix2 = new DOMMatrix([a2, b2, c2, d2, e2, f2]);
            pattern.setTransform(finalMatrix2);
            ctx.fillStyle = pattern;

            // Fill bounding box of Triangle 2 (padded by 1 to prevent seams)
            minX = Math.min(bx, projBx, projAx); maxX = Math.max(bx, projBx, projAx);
            minY = Math.min(by, projBy, projAy); maxY = Math.max(by, projBy, projAy);
            ctx.fillRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);
            ctx.restore();
        }
    }

    drawProjectedFace(ctx, p1, p2, px, py, fillStyle, shouldStroke = false, textureCanvas = null, damageAlpha = 0, height = 40) {
        const face = this.computeProjectedFace(p1, p2, px, py, height);

        this.traceProjectedFace(ctx, p1, p2, face);
        ctx.fillStyle = fillStyle;
        ctx.fill();

        if (textureCanvas && wallTextureSettings.enabled) {
            this.drawFaceTexture(ctx, p1, p2, face, textureCanvas, height);
        }

        if (damageAlpha > 0) {
            ctx.save();
            this.traceProjectedFace(ctx, p1, p2, face);
            ctx.clip();
            ctx.fillStyle = `rgba(244, 67, 54, ${damageAlpha})`;
            ctx.fill();
            ctx.restore();
        }

        if (shouldStroke) {
            this.traceProjectedFace(ctx, p1, p2, face);
            ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
            ctx.lineWidth = 1.0;
            ctx.stroke();
        }
    }

    drawRoof(ctx, seg, px, py, themeColor, damageAlpha = 0) {
        const edges = this.getSegmentEdges(seg);
        const height = seg.height || 40;
        const clampedHeight = Math.min(height, CAMERA_HEIGHT - 10);
        const alpha = clampedHeight / (CAMERA_HEIGHT - clampedHeight);

        const projCorners = [];
        for (let i = 0; i < 4; i++) {
            const p = edges[i][0];
            const dx = p.x - px;
            const dy = p.y - py;
            const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            
            projCorners.push({
                x: p.x + Math.cos(angle) * dist * alpha,
                y: p.y + Math.sin(angle) * dist * alpha
            });
        }

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(projCorners[0].x, projCorners[0].y);
        for (let i = 1; i < 4; i++) {
            ctx.lineTo(projCorners[i].x, projCorners[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = "#12161f";
        ctx.fill();

        const baseR = themeColor.r;
        const baseG = themeColor.g;
        const baseB = themeColor.b;
        ctx.fillStyle = `rgba(${baseR}, ${baseG}, ${baseB}, 0.08)`;
        ctx.fill();

        if (damageAlpha > 0) {
            ctx.fillStyle = `rgba(244, 67, 54, ${damageAlpha})`;
            ctx.fill();
        }

        ctx.strokeStyle = `rgb(${baseR}, ${baseG}, ${baseB})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.strokeStyle = `rgba(${baseR}, ${baseG}, ${baseB}, 0.4)`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        
        let cx = 0, cy = 0;
        for (let i = 0; i < 4; i++) {
            cx += projCorners[i].x;
            cy += projCorners[i].y;
        }
        cx /= 4;
        cy /= 4;

        for (let i = 0; i < 4; i++) {
            const p = projCorners[i];
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.hypot(dx, dy);
            if (dist > 2) {
                const ix = cx + dx * (1 - 2.5 / dist);
                const iy = cy + dy * (1 - 2.5 / dist);
                if (i === 0) ctx.moveTo(ix, iy);
                else ctx.lineTo(ix, iy);
            }
        }
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    }

    drawExplosion(px, py, maxDist, state, targetCtx) {
        this.updateSharedEdges(state);

        const maxDistSq = maxDist * maxDist;
        const visibleWalls = [];
        const candidateWalls = state.wallSpatialHash ? state.wallSpatialHash.queryBounds(px - maxDist, py - maxDist, px + maxDist, py + maxDist) : state.walls;
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

                const healthRatio = Math.max(0, seg.health / seg.maxHealth);
                const damageAlpha = (1 - healthRatio) * 0.45;
                this.drawProjectedFace(targetCtx, p1, p2, px, py, wallColor, false, getWallTextureCanvas(seg.theme || THEME_COLORS[0]), damageAlpha, seg.height);
            }

            // Mask roof in explosion
            const height = seg.height || 40;
            const clampedHeight = Math.min(height, CAMERA_HEIGHT - 10);
            const alpha = clampedHeight / (CAMERA_HEIGHT - clampedHeight);

            targetCtx.beginPath();
            for (let i = 0; i < 4; i++) {
                const p = edges[i][0];
                const dx = p.x - px;
                const dy = p.y - py;
                const dist = Math.hypot(dx, dy);
                const angle = Math.atan2(dy, dx);
                const projX = p.x + Math.cos(angle) * dist * alpha;
                const projY = p.y + Math.sin(angle) * dist * alpha;
                if (i === 0) targetCtx.moveTo(projX, projY);
                else targetCtx.lineTo(projX, projY);
            }
            targetCtx.closePath();
            targetCtx.fillStyle = "#000000";
            targetCtx.fill();
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

    draw3DBuildings(ctx, state, viewport) {
        const px = state.player.x;
        const py = state.player.y;

        const vx = viewport ? viewport.x : px;
        const vy = viewport ? viewport.y : py;

        this.updateSharedEdges(state);

        ctx.save();

        const visibleObjects = [];
        const candidateWalls = state.wallSpatialHash ? state.wallSpatialHash.queryBounds(vx - 1500, vy - 1500, vx + 1500, vy + 1500) : state.walls;
        for (let i = 0; i < candidateWalls.length; i++) {
            const seg = candidateWalls[i];
            if (seg.isDead) continue;
            const distSq = (seg.x - vx) ** 2 + (seg.y - vy) ** 2;
            if (distSq <= 2250000) {
                seg._distSq = distSq;
                seg._renderType = "wall";
                visibleObjects.push(seg);
            }
        }

        if (state.pickups) {
            for (let i = 0; i < state.pickups.length; i++) {
                const p = state.pickups[i];
                if (p.isDead || p.strategy?.renderMode !== "3d") continue;
                const distSq = (p.x - vx) ** 2 + (p.y - vy) ** 2;
                if (distSq <= 2250000) {
                    p._distSq = distSq;
                    p._renderType = p.getRender3DKey();
                    visibleObjects.push(p);
                }
            }
        }

        visibleObjects.sort((a, b) => b._distSq - a._distSq);

        for (const obj of visibleObjects) {
            if (obj._renderType === "wall") {
                const seg = obj;
                const activeTheme = seg.theme || THEME_COLORS[0];
                const wallColor = this.getWallColor(seg, THEME_COLORS[0], 1.0);
                const wallTexture = getWallTextureCanvas(activeTheme);
                const edges = this.getSegmentEdges(seg);

                if (!seg.sharedEdges) {
                    seg.sharedEdges = [false, false, false, false];
                }

                const healthRatio = Math.max(0, seg.health / seg.maxHealth);
                const damageAlpha = (1 - healthRatio) * 0.45;

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

                    this.drawProjectedFace(ctx, p1, p2, px, py, wallColor, true, wallTexture, damageAlpha, seg.height);
                }

                this.drawRoof(ctx, seg, px, py, activeTheme, damageAlpha);
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
