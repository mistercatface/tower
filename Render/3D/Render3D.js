import { THEME_COLORS } from "../../Config/Config.js";
import {
    DEFAULT_PROP_HEIGHT,
    drawCylinder,
    drawBand,
    drawCylinderRibs,
    drawCap,
    drawBox,
    drawSphere,
    drawCone,
    drawStack,
    drawBarkLines,
} from "./PropPrimitives.js";
import { projectVertical, getHeightSlice, isFaceTowardViewer } from "./Projection3D.js";

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
        const { x, y, facing = 0 } = p;

        drawCylinder(ctx, x, y, px, py, {
            radius,
            height: DEFAULT_PROP_HEIGHT,
            colors: { shadow: "#3F0000", mid: "#B71C1C", highlight: "#FF5252" },
            stroke: "#4A0E0E",
            facing,
        });

        const { slice1, slice2 } = drawBand(ctx, x, y, px, py, {
            radius,
            t0: 0.35,
            t1: 0.65,
            fill: "#FFEB3B",
            stroke: "#4A0E0E",
            facing,
        });

        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
            const phi = facing + (i * Math.PI) / 4;
            const rivetX = slice1.centerX + Math.cos(phi) * slice1.size;
            const rivetY = slice1.centerY + Math.sin(phi) * slice1.size;
            if (!isFaceTowardViewer(rivetX, rivetY, x, y, px, py)) continue;
            const phi2 = phi + 0.25;
            ctx.beginPath();
            ctx.moveTo(rivetX, rivetY);
            ctx.lineTo(
                slice2.centerX + Math.cos(phi2) * slice2.size,
                slice2.centerY + Math.sin(phi2) * slice2.size
            );
            ctx.stroke();
        }

        drawCylinderRibs(ctx, x, y, px, py, {
            radius,
            ts: [0.25, 0.75],
            stroke: "rgba(0, 0, 0, 0.45)",
            facing,
        });

        const { topX, topY, capRadius } = drawCap(ctx, x, y, px, py, {
            radius,
            capColors: { inner: "#455A64", mid: "#37474F", outer: "#263238" },
            stroke: "#1A0A00",
            facing,
        });

        const triSize = capRadius * 0.55;
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
        drawBox(ctx, p.x, p.y, px, py, {
            halfSize,
            faceColors: { shadow: "#4E342E", mid: "#8D6E63", highlight: "#A1887F" },
            topColors: { light: "#BCAAA4", mid: "#A1887F", dark: "#8D6E63" },
            stroke: "#3E2723",
            plankTs: { values: [0.33, 0.66], stroke: "rgba(62, 39, 35, 0.55)" },
            topCross: { stroke: "rgba(62, 39, 35, 0.6)" },
            facing: p.facing ?? 0,
        });
    }

    draw3DTree(ctx, p, px, py) {
        const trunkRadius = 5;
        const trunkHeight = 54;
        const { x, y, facing = 0 } = p;

        const { projection } = drawCylinder(ctx, x, y, px, py, {
            radius: trunkRadius,
            height: trunkHeight,
            colors: { shadow: "#3E2723", mid: "#6D4C41", highlight: "#A1887F" },
            stroke: "#2E1B14",
            facing,
        });

        drawBarkLines(ctx, x, y, px, py, {
            radius: trunkRadius,
            height: trunkHeight,
            ts: [0.2, 0.45, 0.7],
            stroke: "rgba(46, 27, 20, 0.45)",
            facing,
        });

        const { topX, topY } = projection;
        const canopyOffset = 2.5;
        drawSphere(ctx, topX - Math.cos(facing) * canopyOffset, topY - Math.sin(facing) * canopyOffset, px, py, {
            radius: 13,
            height: 26,
            colors: { shadow: "#1B5E20", mid: "#388E3C", highlight: "#66BB6A" },
            stroke: "#1B4332",
            facing,
        });
        drawSphere(ctx, topX + Math.cos(facing + 0.6) * 3, topY + Math.sin(facing + 0.6) * 3, px, py, {
            radius: 10,
            height: 20,
            colors: { shadow: "#2E7D32", mid: "#43A047", highlight: "#81C784" },
            stroke: "#1B4332",
            facing,
        });
        drawSphere(ctx, topX + Math.cos(facing - 0.5) * 2, topY + Math.sin(facing - 0.5) * 2, px, py, {
            radius: 11,
            height: 22,
            colors: { shadow: "#33691E", mid: "#4CAF50", highlight: "#A5D6A7" },
            stroke: "#1B4332",
            facing,
        });
    }

    draw3DTrafficCone(ctx, p, px, py) {
        const baseRadius = p.radius || 6;
        const height = 20;
        const { x, y, facing = 0 } = p;
        const coneColors = { shadow: "#E65100", mid: "#FF6D00", highlight: "#FFAB40" };

        drawCone(ctx, x, y, px, py, { baseRadius, height, colors: coneColors, stroke: "#BF360C", facing });
        drawBand(ctx, x, y, px, py, {
            radius: baseRadius,
            height,
            t0: 0.52,
            t1: 0.68,
            fill: "#FAFAFA",
            stroke: "#BDBDBD",
            facing,
            topRadius: 0,
        });
        drawBand(ctx, x, y, px, py, {
            radius: baseRadius,
            height,
            t0: 0.15,
            t1: 0.35,
            fill: "#EEEEEE",
            stroke: "#BDBDBD",
            lineWidth: 0.6,
            facing,
            topRadius: 0,
        });
    }

    draw3DSnowman(ctx, p, px, py) {
        const { x, y, facing = 0 } = p;
        const stackHeight = 38;
        const snow = { shadow: "#B0BEC5", mid: "#ECEFF1", highlight: "#FFFFFF" };

        drawStack(ctx, x, y, px, py, {
            height: stackHeight,
            segments: [
                { t: 0.18, radius: 8, blobHeight: 16, colors: snow, stroke: "#90A4AE" },
                { t: 0.48, radius: 6, blobHeight: 13, colors: snow, stroke: "#90A4AE" },
                { t: 0.76, radius: 4.5, blobHeight: 10, colors: snow, stroke: "#90A4AE" },
            ],
            facing,
        });

        const projection = projectVertical(x, y, px, py, stackHeight);
        const head = getHeightSlice(projection, 4.5, 0.76);
        const noseX = head.centerX + Math.cos(facing) * 5;
        const noseY = head.centerY + Math.sin(facing) * 5;

        drawCone(ctx, noseX, noseY, px, py, {
            baseRadius: 1.2,
            height: 5,
            colors: { shadow: "#E65100", mid: "#FF9800", highlight: "#FFB74D" },
            stroke: "#E65100",
            lineWidth: 0.7,
            facing,
        });

        ctx.fillStyle = "#212121";
        const eyeOffset = 2.2;
        const perp = facing + Math.PI / 2;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(
                head.centerX + Math.cos(facing) * 2 + Math.cos(perp) * eyeOffset * side,
                head.centerY + Math.sin(facing) * 2 + Math.sin(perp) * eyeOffset * side,
                0.7, 0, Math.PI * 2
            );
            ctx.fill();
        }
    }

    draw3DPalm(ctx, p, px, py) {
        const trunkRadius = 3.5;
        const trunkHeight = 48;
        const { x, y, facing = 0 } = p;

        const { projection } = drawCylinder(ctx, x, y, px, py, {
            radius: trunkRadius,
            height: trunkHeight,
            colors: { shadow: "#5D4037", mid: "#8D6E63", highlight: "#BCAAA4" },
            stroke: "#4E342E",
            facing,
        });

        const { topX, topY } = projection;
        const frondColors = { shadow: "#33691E", mid: "#558B2F", highlight: "#9CCC65" };
        for (let i = 0; i < 6; i++) {
            const frondFacing = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const fx = topX + Math.cos(frondFacing) * 5;
            const fy = topY + Math.sin(frondFacing) * 5;
            drawCone(ctx, fx, fy, px, py, {
                baseRadius: 3.5,
                height: 16,
                colors: frondColors,
                stroke: "#1B5E20",
                lineWidth: 0.8,
                facing: frondFacing,
            });
        }

        drawSphere(ctx, topX, topY, px, py, {
            radius: 4,
            height: 8,
            colors: { shadow: "#689F38", mid: "#7CB342", highlight: "#AED581" },
            stroke: "#33691E",
            lineWidth: 0.7,
            facing,
        });
    }

    draw3DRock(ctx, p, px, py) {
        const { x, y, facing = 0 } = p;
        const gray = { shadow: "#424242", mid: "#757575", highlight: "#BDBDBD" };

        drawSphere(ctx, x - 1.5, y + 1, px, py, {
            radius: 7,
            height: 12,
            colors: gray,
            stroke: "#37474F",
            facing,
        });
        drawSphere(ctx, x + 2, y - 1.5, px, py, {
            radius: 5,
            height: 9,
            colors: { shadow: "#616161", mid: "#9E9E9E", highlight: "#E0E0E0" },
            stroke: "#424242",
            lineWidth: 0.8,
            facing: facing + 0.4,
        });
    }

    draw3DLampPost(ctx, p, px, py) {
        const { x, y, facing = 0 } = p;
        const poleHeight = 46;

        const { projection } = drawCylinder(ctx, x, y, px, py, {
            radius: 2.2,
            height: poleHeight,
            colors: { shadow: "#263238", mid: "#546E7A", highlight: "#90A4AE" },
            stroke: "#263238",
            lineWidth: 0.8,
            facing,
        });

        const { topX, topY } = projection;
        drawBox(ctx, topX, topY, px, py, {
            halfSize: 4,
            height: 6,
            faceColors: { shadow: "#37474F", mid: "#607D8B", highlight: "#B0BEC5" },
            topColors: { light: "#CFD8DC", mid: "#90A4AE", dark: "#546E7A" },
            stroke: "#263238",
            lineWidth: 0.8,
            facing,
        });

        drawCap(ctx, topX, topY, px, py, {
            radius: 3,
            height: 8,
            capColors: { inner: "#FFF9C4", mid: "#FFEB3B", outer: "#FBC02D" },
            stroke: "#F57F17",
            lineWidth: 0.7,
            facing,
        });
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
                ctx.save();
                const draw = this.getPropRenderer(obj._renderType);
                if (draw) draw(ctx, obj, px, py);
                ctx.restore();
            }
        }

        ctx.restore();
    }
}
