import { THEME_COLORS } from "../../Config/Config.js";
import {
    projectVertical,
    getHeightSlice,
    getRadialSilhouette,
    extrudeBox,
    isFaceTowardViewer,
    createSideGradient,
} from "./Projection3D.js";

const PROP_HEIGHT = 14;

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
            ctx.stroke();
        }
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

    draw3DBarrel(ctx, p, px, py) {
        const radius = p.radius || 8;
        const projection = projectVertical(p.x, p.y, px, py, PROP_HEIGHT);
        const { cx, cy, viewAngle } = projection;
        const silhouette = getRadialSilhouette(projection, radius);
        const { baseLeft, baseRight, topLeft, topRight, topRadius } = silhouette;

        const sideGrad = createSideGradient(ctx, baseLeft, baseRight, viewAngle, {
            shadow: "#3F0000",
            mid: "#B71C1C",
            highlight: "#FF5252",
        });

        ctx.fillStyle = sideGrad;
        ctx.strokeStyle = "#4A0E0E";
        ctx.lineWidth = 1.0;

        ctx.beginPath();
        ctx.moveTo(topLeft.x, topLeft.y);
        ctx.lineTo(topRight.x, topRight.y);
        ctx.lineTo(baseRight.x, baseRight.y);
        ctx.arc(cx, cy, radius, viewAngle - Math.PI / 2, viewAngle + Math.PI / 2, true);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#FFEB3B";
        ctx.strokeStyle = "#4A0E0E";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        const t1 = 0.35;
        const t2 = 0.65;
        const slice1 = getHeightSlice(projection, radius, t1);
        const slice2 = getHeightSlice(projection, radius, t2);

        ctx.arc(slice1.centerX, slice1.centerY, slice1.size, viewAngle - Math.PI / 2, viewAngle + Math.PI / 2, true);
        ctx.lineTo(
            slice2.centerX + Math.cos(viewAngle + Math.PI / 2) * slice2.size,
            slice2.centerY + Math.sin(viewAngle + Math.PI / 2) * slice2.size
        );
        ctx.arc(slice2.centerX, slice2.centerY, slice2.size, viewAngle + Math.PI / 2, viewAngle - Math.PI / 2, false);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
            const phi = (i * Math.PI) / 4;
            if (Math.cos(phi - viewAngle) < 0) {
                const phi2 = phi + 0.25;
                ctx.beginPath();
                ctx.moveTo(
                    slice1.centerX + Math.cos(phi) * slice1.size,
                    slice1.centerY + Math.sin(phi) * slice1.size
                );
                ctx.lineTo(
                    slice2.centerX + Math.cos(phi2) * slice2.size,
                    slice2.centerY + Math.sin(phi2) * slice2.size
                );
                ctx.stroke();
            }
        }

        ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
        ctx.lineWidth = 1.2;
        for (const t of [0.25, 0.75]) {
            const slice = getHeightSlice(projection, radius, t);
            ctx.beginPath();
            ctx.arc(slice.centerX, slice.centerY, slice.size, viewAngle - Math.PI / 2, viewAngle + Math.PI / 2, true);
            ctx.stroke();
        }

        const { topX, topY } = projection;
        const topGrad = ctx.createRadialGradient(topX, topY, 0, topX, topY, topRadius);
        topGrad.addColorStop(0.0, "#455A64");
        topGrad.addColorStop(0.7, "#37474F");
        topGrad.addColorStop(1.0, "#263238");

        ctx.fillStyle = topGrad;
        ctx.strokeStyle = "#1A0A00";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(topX, topY, topRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const triSize = topRadius * 0.55;
        if (triSize > 2) {
            ctx.fillStyle = "#FFEB3B";
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(topX, topY - triSize * 0.7);
            ctx.lineTo(topX + triSize * 0.86, topY + triSize * 0.4);
            ctx.lineTo(topX - triSize * 0.86, topY + triSize * 0.4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#000000";
            ctx.font = `bold ${Math.round(triSize * 1.1)}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("!", topX, topY + triSize * 0.05);
        }
    }

    draw3DCrate(ctx, p, px, py) {
        const halfSize = p.radius || 8;
        const projection = projectVertical(p.x, p.y, px, py, PROP_HEIGHT);
        const { cx, cy, topX, topY, viewAngle } = projection;
        const box = extrudeBox(projection, halfSize);

        const woodColors = {
            shadow: "#4E342E",
            mid: "#8D6E63",
            highlight: "#A1887F",
        };

        for (const face of box.faces) {
            const edgeMidX = (face.baseA.x + face.baseB.x) / 2;
            const edgeMidY = (face.baseA.y + face.baseB.y) / 2;
            if (!isFaceTowardViewer(edgeMidX, edgeMidY, cx, cy, px, py)) continue;

            ctx.fillStyle = createSideGradient(ctx, face.baseA, face.baseB, viewAngle, woodColors);
            ctx.strokeStyle = "#3E2723";
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(face.topA.x, face.topA.y);
            ctx.lineTo(face.topB.x, face.topB.y);
            ctx.lineTo(face.baseB.x, face.baseB.y);
            ctx.lineTo(face.baseA.x, face.baseA.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = "rgba(62, 39, 35, 0.55)";
            ctx.lineWidth = 0.8;
            for (const t of [0.33, 0.66]) {
                const yA = face.topA.y + (face.baseA.y - face.topA.y) * t;
                const xA = face.topA.x + (face.baseA.x - face.topA.x) * t;
                const yB = face.topB.y + (face.baseB.y - face.topB.y) * t;
                const xB = face.topB.x + (face.baseB.x - face.topB.x) * t;
                ctx.beginPath();
                ctx.moveTo(xA, yA);
                ctx.lineTo(xB, yB);
                ctx.stroke();
            }
        }

        const topGrad = ctx.createLinearGradient(
            topX - box.topHalfSize, topY - box.topHalfSize,
            topX + box.topHalfSize, topY + box.topHalfSize
        );
        topGrad.addColorStop(0.0, "#BCAAA4");
        topGrad.addColorStop(0.5, "#A1887F");
        topGrad.addColorStop(1.0, "#8D6E63");

        ctx.fillStyle = topGrad;
        ctx.strokeStyle = "#3E2723";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(box.topCorners[0].x, box.topCorners[0].y);
        for (let i = 1; i < box.topCorners.length; i++) {
            ctx.lineTo(box.topCorners[i].x, box.topCorners[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = "rgba(62, 39, 35, 0.6)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(box.topCorners[0].x, (box.topCorners[0].y + box.topCorners[2].y) / 2);
        ctx.lineTo(box.topCorners[1].x, (box.topCorners[1].y + box.topCorners[3].y) / 2);
        ctx.moveTo((box.topCorners[0].x + box.topCorners[1].x) / 2, box.topCorners[0].y);
        ctx.lineTo((box.topCorners[2].x + box.topCorners[3].x) / 2, box.topCorners[2].y);
        ctx.stroke();
    }

    getPropRenderer(key) {
        if (!key) return null;
        const methodName = `draw3D${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        const method = this[methodName];
        return method ? method.bind(this) : null;
    }

    draw3DBuildings(ctx, state, viewport) {
        const px = state.player.x;
        const py = state.player.y;

        this.updateSharedEdges(state);

        ctx.save();

        const visibleObjects = [];
        const candidateWalls = state.wallSpatialHash ? state.wallSpatialHash.queryBounds(px - 1500, py - 1500, px + 1500, py + 1500) : state.walls;
        for (let i = 0; i < candidateWalls.length; i++) {
            const seg = candidateWalls[i];
            if (seg.isDead) continue;
            const distSq = (seg.x - px) ** 2 + (seg.y - py) ** 2;
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
                const distSq = (p.x - px) ** 2 + (p.y - py) ** 2;
                if (distSq <= 2250000) {
                    p._distSq = distSq;
                    p._renderType = p.strategy.render3DKey;
                    visibleObjects.push(p);
                }
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
                const draw = this.getPropRenderer(obj._renderType);
                if (draw) draw(ctx, obj, px, py);
            }
        }

        ctx.restore();
    }
}
