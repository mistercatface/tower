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
        const baseR = theme ? theme.r : 0;
        const baseG = theme ? theme.g : 188;
        const baseB = theme ? theme.b : 212;
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
        for (let i = 0; i < state.walls.length; i++) {
            const seg = state.walls[i];
            if (seg.isDead) continue;
            const distSq = (seg.x - px) ** 2 + (seg.y - py) ** 2;
            if (distSq <= maxDistSq) {
                seg._distSq = distSq;
                visibleWalls.push(seg);
            }
        }
        visibleWalls.sort((a, b) => b._distSq - a._distSq);

        for (const seg of visibleWalls) {

            const wallColor = this.getWallColor(seg, state.wallTheme, 0.5);
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
        const cx = p.x;
        const cy = p.y;
        const radius = p.radius || 8;

        // Calculate distance from player to barrel
        const dx = cx - px;
        const dy = cy - py;
        const dist = Math.hypot(dx, dy);

        // Perspective parameters
        const BARREL_HEIGHT = 14; // Shorter, stubbier height
        const CAMERA_HEIGHT = 160; // Camera height
        const alpha = BARREL_HEIGHT / (CAMERA_HEIGHT - BARREL_HEIGHT);

        // Calculate the top center
        let tx, ty;
        if (dist === 0) {
            tx = cx;
            ty = cy;
        } else {
            tx = cx + dx * alpha;
            ty = cy + dy * alpha;
        }

        // Top radius is also scaled due to perspective
        const scale = 1 + alpha;
        const topRadius = radius * scale;

        // Calculate view angle
        const viewAngle = Math.atan2(dy, dx);

        // Silhouette points on base circle (perpendicular to view angle)
        const p1_base_x = cx + Math.cos(viewAngle + Math.PI / 2) * radius;
        const p1_base_y = cy + Math.sin(viewAngle + Math.PI / 2) * radius;
        const p2_base_x = cx + Math.cos(viewAngle - Math.PI / 2) * radius;
        const p2_base_y = cy + Math.sin(viewAngle - Math.PI / 2) * radius;

        // Silhouette points on top circle
        const p1_top_x = tx + Math.cos(viewAngle + Math.PI / 2) * topRadius;
        const p1_top_y = ty + Math.sin(viewAngle + Math.PI / 2) * topRadius;
        const p2_top_x = tx + Math.cos(viewAngle - Math.PI / 2) * topRadius;
        const p2_top_y = ty + Math.sin(viewAngle - Math.PI / 2) * topRadius;

        // --- RENDER SIDE FACES ---
        // Shading: calculate highlight position based on a fixed light direction in the world (top-left)
        const lightAngle = -3 * Math.PI / 4;
        const lx = Math.cos(lightAngle);
        const ly = Math.sin(lightAngle);
        
        // Transverse normal vector
        const nx = Math.cos(viewAngle + Math.PI / 2);
        const ny = Math.sin(viewAngle + Math.PI / 2);
        const dot = lx * nx + ly * ny;
        const t_highlight = Math.max(0.1, Math.min(0.9, 0.5 + dot * 0.5));

        const sideGrad = ctx.createLinearGradient(p1_base_x, p1_base_y, p2_base_x, p2_base_y);
        sideGrad.addColorStop(0.0, "#3F0000"); // Left shadow
        sideGrad.addColorStop(Math.max(0.0, t_highlight - 0.25), "#B71C1C");
        sideGrad.addColorStop(t_highlight, "#FF5252"); // Light highlight
        sideGrad.addColorStop(Math.min(1.0, t_highlight + 0.25), "#B71C1C");
        sideGrad.addColorStop(1.0, "#3F0000"); // Right shadow

        ctx.fillStyle = sideGrad;
        ctx.strokeStyle = "#4A0E0E";
        ctx.lineWidth = 1.0;

        ctx.beginPath();
        ctx.moveTo(p1_top_x, p1_top_y);
        ctx.lineTo(p2_top_x, p2_top_y);
        ctx.lineTo(p2_base_x, p2_base_y);
        
        // Curved bottom arc facing the player (sweeps from p2_base to p1_base counter-clockwise)
        ctx.arc(cx, cy, radius, viewAngle - Math.PI / 2, viewAngle + Math.PI / 2, true);
        
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // --- RENDER YELLOW HAZARD BAND AROUND MIDDLE ---
        ctx.fillStyle = "#FFEB3B";
        ctx.strokeStyle = "#4A0E0E";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        const t1 = 0.35;
        const t2 = 0.65;
        const rx1 = cx + (tx - cx) * t1;
        const ry1 = cy + (ty - cy) * t1;
        const r_rib1 = radius * (1 + alpha * t1);
        const rx2 = cx + (tx - cx) * t2;
        const ry2 = cy + (ty - cy) * t2;
        const r_rib2 = radius * (1 + alpha * t2);

        // Path: arc 1 -> line -> arc 2 -> line
        ctx.arc(rx1, ry1, r_rib1, viewAngle - Math.PI / 2, viewAngle + Math.PI / 2, true);
        ctx.lineTo(rx2 + Math.cos(viewAngle + Math.PI / 2) * r_rib2, ry2 + Math.sin(viewAngle + Math.PI / 2) * r_rib2);
        ctx.arc(rx2, ry2, r_rib2, viewAngle + Math.PI / 2, viewAngle - Math.PI / 2, false);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw diagonal black hazard lines inside the yellow band (FIXED WORLD ORIENTATION)
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
            const phi = (i * Math.PI) / 4;
            // Only draw if this stripe is on the side facing the player
            if (Math.cos(phi - viewAngle) < 0) {
                const x1 = rx1 + Math.cos(phi) * r_rib1;
                const y1 = ry1 + Math.sin(phi) * r_rib1;
                const phi2 = phi + 0.25; // tilt the stripe slightly
                const x2 = rx2 + Math.cos(phi2) * r_rib2;
                const y2 = ry2 + Math.sin(phi2) * r_rib2;
                
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        }

        // --- RENDER HOOPS/RIBS (CURVED ARCS) ---
        ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
        ctx.lineWidth = 1.2;
        for (const t of [0.25, 0.75]) {
            const rx = cx + (tx - cx) * t;
            const ry = cy + (ty - cy) * t;
            const r_rib = radius * (1 + alpha * t);
            
            ctx.beginPath();
            ctx.arc(rx, ry, r_rib, viewAngle - Math.PI / 2, viewAngle + Math.PI / 2, true);
            ctx.stroke();
        }

        // --- RENDER TOP LID (METALLIC GREY) ---
        const topGrad = ctx.createRadialGradient(tx, ty, 0, tx, ty, topRadius);
        topGrad.addColorStop(0.0, "#455A64"); // Bright center steel grey
        topGrad.addColorStop(0.7, "#37474F"); // Slate steel grey
        topGrad.addColorStop(1.0, "#263238"); // Dark edge steel

        ctx.fillStyle = topGrad;
        ctx.strokeStyle = "#1A0A00";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(tx, ty, topRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // --- RENDER TOP WARNING TRIANGLE ---
        const triSize = topRadius * 0.55;
        if (triSize > 2) {
            ctx.fillStyle = "#FFEB3B"; // yellow warning triangle
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(tx, ty - triSize * 0.7);
            ctx.lineTo(tx + triSize * 0.86, ty + triSize * 0.4);
            ctx.lineTo(tx - triSize * 0.86, ty + triSize * 0.4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Black exclamation point in triangle
            ctx.fillStyle = "#000000";
            ctx.font = `bold ${Math.round(triSize * 1.1)}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("!", tx, ty + triSize * 0.05);
        }
    }

    draw3DBuildings(ctx, state, viewport) {
        const px = state.player.x;
        const py = state.player.y;

        this.updateSharedEdges(state);

        ctx.save();

        const visibleObjects = [];
        for (let i = 0; i < state.walls.length; i++) {
            const seg = state.walls[i];
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
                if (p.isDead || p.type !== "barrel") continue;
                const distSq = (p.x - px) ** 2 + (p.y - py) ** 2;
                if (distSq <= 2250000) {
                    p._distSq = distSq;
                    p._renderType = "barrel";
                    visibleObjects.push(p);
                }
            }
        }

        visibleObjects.sort((a, b) => b._distSq - a._distSq);

        for (const obj of visibleObjects) {
            if (obj._renderType === "wall") {
                const seg = obj;
                const wallColor = this.getWallColor(seg, state.wallTheme, 1.0);
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
            } else if (obj._renderType === "barrel") {
                this.draw3DBarrel(ctx, obj, px, py);
            }
        }

        ctx.restore();
    }
}
