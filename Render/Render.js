import { ChunkManager } from "./ChunkManager.js";
import { SpriteCache } from "./SpriteCache.js";
import { RenderStrategies } from "./RenderStrategies.js";
import { Explosion } from "../Entities/Explosion/Explosion.js";

export class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.enemyCache = new SpriteCache();
        this.missileCache = new SpriteCache();
        this.pickupCache = new SpriteCache();
        this.turretCache = new SpriteCache();
        this.chunkManager = new ChunkManager();
        this.sharedEdgesDirty = true;
        this.lastWalls = null;
        this.lastAliveCount = 0;
    }

    renderMapScene(state, viewport) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (viewport) viewport.apply(this.ctx);
        this.drawMap(state);
        const tempPlanet = { ...state.planet, x: state.mapPlayerX, y: state.mapPlayerY };
        RenderStrategies.planet(this.ctx, tempPlanet, 0);
        for (const turret of state.turrets) {
            RenderStrategies.turret(this.ctx, turret, state.mapPlayerX, state.mapPlayerY, state.planet.radius, 0, 1, this.turretCache);
        }
        for (const ft of state.floatingTexts) RenderStrategies.floatingText(this.ctx, ft);
        this.ctx.restore();
    }

    renderCombatScene(state, viewport) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (viewport) viewport.apply(this.ctx);
        RenderStrategies.planet(this.ctx, state.planet, state.weapon.range);

        for (const p of state.pickups) RenderStrategies.pickup(this.ctx, p, this.pickupCache);
        for (const p of state.projectiles) RenderStrategies.missile(this.ctx, p, p.faction === "player" ? "#FFEB3B" : "#F44336", this.missileCache);
        for (const e of state.enemies) {
            RenderStrategies.enemy(this.ctx, e, this.enemyCache);
            RenderStrategies.turret(this.ctx, e.turret, e.x, e.y, e.radius, 0, 1, this.turretCache, e.color);
        }
        if (state.activeLasers) {
            for (const laser of state.activeLasers) {
                RenderStrategies.laser(this.ctx, laser);
            }
        }
        RenderStrategies.planet(this.ctx, state.planet, 0);
        for (const turret of state.turrets) {
            RenderStrategies.turret(this.ctx, turret, state.planet.x, state.planet.y, state.planet.radius, turret.charge, state.weapon.chargeTime, this.turretCache);
        }
        Explosion.renderAll(this.ctx, state, this);
        //this.drawDebugFlowField(state);
        this.drawShadows(state);
        // this.drawWallInteriors(state); // Disabled roofs for skyscraper style
        this.drawVisibleWallEdges(state);

        if (state.planet.queuedTargetX != null && state.planet.queuedTargetY != null) {
            RenderStrategies.targetMarker(this.ctx, state.planet.queuedTargetX, state.planet.queuedTargetY);
        } else if (state.planet.isMoving && state.planet.targetX !== null && state.planet.targetY !== null) {
            RenderStrategies.targetMarker(this.ctx, state.planet.targetX, state.planet.targetY);
        }

        for (const ft of state.floatingTexts) RenderStrategies.floatingText(this.ctx, ft);
        this.ctx.restore();
    }

    drawDebugSpawnRadius(state) {
        const visualRadius = state.spawnRadius - 50;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(state.planet.x - 10000, state.planet.y - 10000, 20000, 20000);
        this.ctx.rect(state.planet.x - visualRadius, state.planet.y - visualRadius, visualRadius * 2, visualRadius * 2);
        this.ctx.fillStyle = "#000000";
        this.ctx.fill("evenodd");
        this.ctx.restore();
    }

    drawShadowPolygons(px, py, maxDist, state, targetCtx) {
        const aliveCount = state.walls.reduce((acc, seg) => acc + (seg.isDead ? 0 : 1), 0);
        if (state.walls !== this.lastWalls || aliveCount !== this.lastAliveCount || this.sharedEdgesDirty) {
            this.lastWalls = state.walls;
            this.lastAliveCount = aliveCount;
            this.sharedEdgesDirty = false;
            this.rebuildSharedEdges(state);
        }

        const theme = state.wallTheme;
        const baseR = theme ? theme.r : 0;
        const baseG = theme ? theme.g : 188;
        const baseB = theme ? theme.b : 212;

        // Sort walls by distance from light source descending (furthest first)
        const sortedWalls = [...state.walls].sort((a, b) => {
            const distA = Math.hypot(a.x - px, a.y - py);
            const distB = Math.hypot(b.x - px, b.y - py);
            return distB - distA;
        });

        for (const seg of sortedWalls) {
            if (seg.isDead) continue;
            const dist = Math.hypot(seg.x - px, seg.y - py);
            if (dist > maxDist) continue;

            const healthRatio = Math.max(0, Math.round((seg.health / seg.maxHealth) * 10) / 10);
            const r = Math.floor(baseR + (244 - baseR) * (1 - healthRatio));
            const g = Math.floor(baseG + (67 - baseG) * (1 - healthRatio));
            const b = Math.floor(baseB + (54 - baseB) * (1 - healthRatio));
            // Wall color shaded to 50% for 3D depth (change 0.5 to 1.0 for full brightness)
            const wallColor = `rgb(${Math.floor(r * 0.5)}, ${Math.floor(g * 0.5)}, ${Math.floor(b * 0.5)})`;

            const cos = Math.cos(seg.angle);
            const sin = Math.sin(seg.angle);
            const hs = seg.size / 2;
            const corners = [
                { x: seg.x + -hs * cos - -hs * sin, y: seg.y + -hs * sin + -hs * cos },
                { x: seg.x + hs * cos - -hs * sin, y: seg.y + hs * sin + -hs * cos },
                { x: seg.x + hs * cos - hs * sin, y: seg.y + hs * sin + hs * cos },
                { x: seg.x + -hs * cos - hs * sin, y: seg.y + -hs * sin + hs * cos },
            ];
            const edges = [
                [corners[0], corners[1]],
                [corners[1], corners[2]],
                [corners[2], corners[3]],
                [corners[3], corners[0]],
            ];

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
                const proj1 = { x: p1.x + Math.cos(angle1) * 3000, y: p1.y + Math.sin(angle1) * 3000 };
                const proj2 = { x: p2.x + Math.cos(angle2) * 3000, y: p2.y + Math.sin(angle2) * 3000 };
                
                targetCtx.fillStyle = wallColor;
                targetCtx.beginPath();
                targetCtx.moveTo(p1.x, p1.y);
                targetCtx.lineTo(proj1.x, proj1.y);
                targetCtx.lineTo(proj2.x, proj2.y);
                targetCtx.lineTo(p2.x, p2.y);
                targetCtx.closePath();
                targetCtx.fill();
            }
        }
    }

    rebuildSharedEdges(state) {
        const activeWalls = [];
        for (const seg of state.walls) {
            if (seg.isDead) continue;
            seg.sharedEdges = [false, false, false, false];
            const cos = Math.cos(seg.angle);
            const sin = Math.sin(seg.angle);
            const hs = seg.size / 2;
            const corners = [
                { x: seg.x + -hs * cos - -hs * sin, y: seg.y + -hs * sin + -hs * cos },
                { x: seg.x + hs * cos - -hs * sin, y: seg.y + hs * sin + -hs * cos },
                { x: seg.x + hs * cos - hs * sin, y: seg.y + hs * sin + hs * cos },
                { x: seg.x + -hs * cos - hs * sin, y: seg.y + -hs * sin + hs * cos },
            ];
            const edges = [
                [corners[0], corners[1]],
                [corners[1], corners[2]],
                [corners[2], corners[3]],
                [corners[3], corners[0]],
            ];
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

        const threshold = 3.0;
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
                            const dist = Math.hypot(e1.cx - e2.cx, e1.cy - e2.cy);
                            if (dist < threshold) {
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

    drawWallInteriors(state) {
        const px = state.planet.x;
        const py = state.planet.y;
        this.ctx.save();
        
        const theme = state.wallTheme;
        const baseR = theme ? theme.r : 0;
        const baseG = theme ? theme.g : 188;
        const baseB = theme ? theme.b : 212;

        // Sort walls by distance descending (furthest first)
        const sortedWalls = [...state.walls].sort((a, b) => {
            const distA = Math.hypot(a.x - px, a.y - py);
            const distB = Math.hypot(b.x - px, b.y - py);
            return distB - distA;
        });

        for (const seg of sortedWalls) {
            if (seg.isDead) continue;
            const dist = Math.hypot(seg.x - px, seg.y - py);
            if (dist > 1500) continue;

            const healthRatio = Math.max(0, Math.round((seg.health / seg.maxHealth) * 10) / 10);
            const r = Math.floor(baseR + (244 - baseR) * (1 - healthRatio));
            const g = Math.floor(baseG + (67 - baseG) * (1 - healthRatio));
            const b = Math.floor(baseB + (54 - baseB) * (1 - healthRatio));
            const darkColor = `rgb(${Math.floor(r * 0.08)}, ${Math.floor(g * 0.08)}, ${Math.floor(b * 0.08)})`;

            this.ctx.fillStyle = darkColor;
            this.ctx.save();
            this.ctx.translate(seg.x, seg.y);
            this.ctx.rotate(seg.angle);
            this.ctx.fillRect(-seg.size / 2 - 0.5, -seg.size / 2 - 0.5, seg.size + 1.0, seg.size + 1.0);
            this.ctx.restore();
        }
        this.ctx.restore();
    }

    drawVisibleWallEdges(state) {
        const px = state.planet.x;
        const py = state.planet.y;

        this.ctx.save();
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";

        const theme = state.wallTheme;
        const baseR = theme ? theme.r : 0;
        const baseG = theme ? theme.g : 188;
        const baseB = theme ? theme.b : 212;

        // Sort walls by distance descending (furthest first)
        const sortedWalls = [...state.walls].sort((a, b) => {
            const distA = Math.hypot(a.x - px, a.y - py);
            const distB = Math.hypot(b.x - px, b.y - py);
            return distB - distA;
        });

        for (const seg of sortedWalls) {
            if (seg.isDead) continue;
            const dist = Math.hypot(seg.x - px, seg.y - py);
            if (dist > 1500) continue;

            if (!seg.sharedEdges) {
                seg.sharedEdges = [false, false, false, false];
            }

            const cos = Math.cos(seg.angle);
            const sin = Math.sin(seg.angle);
            const hs = seg.size / 2;
            const corners = [
                { x: seg.x + -hs * cos - -hs * sin, y: seg.y + -hs * sin + -hs * cos },
                { x: seg.x + hs * cos - -hs * sin, y: seg.y + hs * sin + -hs * cos },
                { x: seg.x + hs * cos - hs * sin, y: seg.y + hs * sin + hs * cos },
                { x: seg.x + -hs * cos - hs * sin, y: seg.y + -hs * sin + hs * cos },
            ];
            const edges = [
                [corners[0], corners[1]],
                [corners[1], corners[2]],
                [corners[2], corners[3]],
                [corners[3], corners[0]],
            ];

            let strokeColor = null;

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

                if (!strokeColor) {
                    const healthRatio = Math.max(0, Math.round((seg.health / seg.maxHealth) * 10) / 10);
                    const r = Math.floor(baseR + (244 - baseR) * (1 - healthRatio));
                    const g = Math.floor(baseG + (67 - baseG) * (1 - healthRatio));
                    const b = Math.floor(baseB + (54 - baseB) * (1 - healthRatio));
                    strokeColor = `rgb(${r},${g},${b})`;
                }

                const angle1 = Math.atan2(p1.y - py, p1.x - px);
                const angle2 = Math.atan2(p2.y - py, p2.x - px);
                const fadeDist = 120;
                const side1 = { x: p1.x + Math.cos(angle1) * fadeDist, y: p1.y + Math.sin(angle1) * fadeDist };
                const side2 = { x: p2.x + Math.cos(angle2) * fadeDist, y: p2.y + Math.sin(angle2) * fadeDist };

                const grad1 = this.ctx.createLinearGradient(p1.x, p1.y, side1.x, side1.y);
                grad1.addColorStop(0, strokeColor);
                grad1.addColorStop(1, "rgba(0, 0, 0, 0)");
                this.ctx.strokeStyle = grad1;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.moveTo(p1.x, p1.y);
                this.ctx.lineTo(side1.x, side1.y);
                this.ctx.stroke();

                const grad2 = this.ctx.createLinearGradient(p2.x, p2.y, side2.x, side2.y);
                grad2.addColorStop(0, strokeColor);
                grad2.addColorStop(1, "rgba(0, 0, 0, 0)");
                this.ctx.strokeStyle = grad2;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.moveTo(p2.x, p2.y);
                this.ctx.lineTo(side2.x, side2.y);
                this.ctx.stroke();

                this.ctx.strokeStyle = strokeColor;
                this.ctx.lineWidth = 4;
                this.ctx.beginPath();
                this.ctx.moveTo(p1.x, p1.y);
                this.ctx.lineTo(p2.x, p2.y);
                this.ctx.stroke();
            }
        }
        this.ctx.restore();
    }

    drawShadows(state) {
        this.ctx.save();

        // 1. Draw the weapon range cutout first (so skyscraper walls can draw on top of it and extend to infinity)
        const weaponRange = state.weapon.range;
        if (weaponRange > 0) {
            this.ctx.fillStyle = "#000000";
            this.ctx.beginPath();
            this.ctx.rect(state.planet.x - 10000, state.planet.y - 10000, 20000, 20000);
            this.ctx.arc(state.planet.x, state.planet.y, weaponRange, 0, Math.PI * 2);
            this.ctx.fill("evenodd");
        }

        // 2. Draw the skyscraper side-walls (shadow polygons)
        this.drawShadowPolygons(state.planet.x, state.planet.y, 1500, state, this.ctx);

        this.ctx.restore();
    }

    drawDebugFlowField(state) {
        const grid = state.gridSystem;
        if (!grid) return;
        const px = grid.centerX;
        const py = grid.centerY;
        for (let row = 0; row < grid.rows; row++) {
            for (let col = 0; col < grid.cols; col++) {
                const flow = grid.flowField[row * grid.cols + col];
                const cx = col * grid.cellSize + px - grid.offsetX;
                const cy = row * grid.cellSize + py - grid.offsetY;
                if (flow) {
                    this.ctx.fillStyle = "rgba(76, 175, 80, 0.15)";
                    this.ctx.fillRect(cx, cy, grid.cellSize - 1, grid.cellSize - 1);
                } else if (grid.grid[row * grid.cols + col] === 1) {
                    this.ctx.fillStyle = "rgba(244, 67, 54, 0.15)";
                    this.ctx.fillRect(cx, cy, grid.cellSize - 1, grid.cellSize - 1);
                }
            }
        }
    }

    drawMap(state) {
        const currentNode = state.mapNodes.find((n) => n.id === state.currentNodeId);
        for (const node of state.mapNodes) {
            for (const connId of node.connections) {
                const targetNode = state.mapNodes.find((n) => n.id === connId);
                if (!targetNode) continue;
                this.ctx.beginPath();
                this.ctx.moveTo(node.x, node.y);
                this.ctx.lineTo(targetNode.x, targetNode.y);
                this.ctx.lineWidth = 2;
                if (node.completed && (targetNode.completed || targetNode.id === state.currentNodeId)) {
                    this.ctx.strokeStyle = "#4CAF50";
                } else if (node.id === state.currentNodeId) {
                    this.ctx.strokeStyle = "#FFEB3B";
                } else {
                    this.ctx.strokeStyle = "#555";
                }
                this.ctx.stroke();
            }
        }
        const waveColors = ["#03A9F4", "#7E57C2", "#AB47BC", "#EC407A", "#F44336"];
        for (const node of state.mapNodes) {
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, 12, 0, Math.PI * 2);
            if (node.id === state.currentNodeId) {
                this.ctx.fillStyle = "#FFEB3B";
            } else if (node.completed) {
                this.ctx.fillStyle = "#4CAF50";
            } else if (currentNode && currentNode.connections.includes(node.id)) {
                const waveIndex = Math.min(4, Math.max(0, (node.wavesTotal || 1) - 1));
                this.ctx.fillStyle = waveColors[waveIndex];
            } else {
                this.ctx.fillStyle = "#333";
            }
            this.ctx.fill();
            this.ctx.lineWidth = 2;
            this.ctx.strokeStyle = "#FFF";
            this.ctx.stroke();
        }
    }
}