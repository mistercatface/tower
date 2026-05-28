import { SpriteCache } from "./SpriteCache.js";
import { Render3D } from "./3D/Render3D.js";

export class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;

        this.enemyCache = new SpriteCache();
        this.missileCache = new SpriteCache();
        this.pickupCache = new SpriteCache();
        this.turretCache = new SpriteCache();
        this.playerCache = new SpriteCache();
        this.render3D = new Render3D();
        this.effectPasses = [
            { zIndex: 0,  fn: (state, viewport) => this.drawRangeIndicator(state, viewport) },
            { zIndex: 50, fn: (state) => this.drawPlayerAndTurrets(state) },
            { zIndex: 60, fn: (state) => this.renderExplosions(state) },
            { zIndex: 70, fn: (state, viewport) => this.render3D.draw3DBuildings(this.ctx, state, viewport) },
            { zIndex: 75, fn: (state) => this.drawEntityBars(state) },
            { zIndex: 80, fn: (state, viewport) => this.drawVisibilityMask(this.ctx, state, viewport) },
            { zIndex: 85, fn: (state) => this.drawTargetMarkers(state) },
        ];

    }

    renderMapScene(state, viewport) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (viewport) viewport.apply(this.ctx);
        this.drawMap(state);

        const oldX = state.player.x;
        const oldY = state.player.y;
        state.player.x = state.mapPlayerX;
        state.player.y = state.mapPlayerY;
        state.player.render(this.ctx, this, state);

        for (const turret of state.turrets) {
            turret.render(this.ctx, state.mapPlayerX, state.mapPlayerY, state.player.radius, this);
        }

        state.player.x = oldX;
        state.player.y = oldY;

        this.renderEntityCollection(state.floatingTexts, state);
        this.ctx.restore();
    }

    buildCombatPipeline(state, viewport) {
        const entityPasses = state.entityLayers.map(layer => ({
            zIndex: layer.zIndex,
            fn: (state) => this.renderEntityCollection(state[layer.key], state)
        }));

        const pipeline = [...this.effectPasses, ...entityPasses];
        pipeline.sort((a, b) => a.zIndex - b.zIndex);
        this._combatPipeline = pipeline.map(p => p.fn);
    }

    renderCombatScene(state, viewport) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (viewport && (state.phase === "combat" || state.phase === "reward" || state.phase === "map_transition")) {
            this.drawOscilloscopeGrid(state, viewport);
        }

        if (viewport) viewport.apply(this.ctx);

        if (!this._combatPipeline) {
            this.buildCombatPipeline(state, viewport);
        }

        for (let i = 0; i < this._combatPipeline.length; i++) {
            this._combatPipeline[i](state, viewport);
        }

        if (state.phase === "map_transition") {
            this.drawTransitionGuides(state);
        }

        if (state.debugMode) {
            this.drawDebugHPA(state, viewport);
        }

        this.ctx.restore();

        if (viewport && (state.phase === "combat" || state.phase === "reward" || state.phase === "map_transition")) {
            this.drawGlobeOverlay(state, viewport);
        }
    }

    drawTransitionGuides(state) {
        const prevNode = state.mapNodes.find(n => n.id === state.currentNodeId);
        const targetNode = state.mapNodes.find(n => n.id === state.mapTargetNodeId);
        if (!prevNode || !targetNode) return;

        const coordsA = state.getNodeCombatCoords(prevNode);
        const coordsB = state.getNodeCombatCoords(targetNode);





        const dx = coordsB.x - state.player.x;
        const dy = coordsB.y - state.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 200) {
            this.ctx.save();
            const angle = Math.atan2(dy, dx);
            const arrowRadius = 80;
            const ax = state.player.x + Math.cos(angle) * arrowRadius;
            const ay = state.player.y + Math.sin(angle) * arrowRadius;

            this.ctx.translate(ax, ay);
            this.ctx.rotate(angle);

            this.ctx.beginPath();
            this.ctx.moveTo(-10, -6);
            this.ctx.lineTo(2, 0);
            this.ctx.lineTo(-10, 6);
            this.ctx.lineWidth = 3;
            this.ctx.strokeStyle = "#00bcd4";
            this.ctx.lineJoin = "round";
            this.ctx.stroke();

            this.ctx.rotate(-angle);
            this.ctx.fillStyle = "rgba(0, 188, 212, 0.8)";
            this.ctx.font = "8px monospace";
            this.ctx.textAlign = "center";
            this.ctx.fillText(`${Math.round(dist)}m`, 0, -12);
            this.ctx.restore();
        }
    }

    renderEntityCollection(collection, state) {
        if (!collection) return;
        for (const entity of collection) {
            entity.render(this.ctx, this, state);
        }
    }

    drawRangeIndicator(state, viewport) {
        const drawRange = (viewport && (state.phase === "combat" || state.phase === "map_transition" || state.phase === "reward")) ? (viewport.getVisualRadius() / viewport.zoom) : state.weapon.range;
        if (viewport && (state.phase === "combat" || state.phase === "map_transition" || state.phase === "reward")) {
            this.ctx.beginPath();
            this.ctx.arc(viewport.x, viewport.y, drawRange, 0, Math.PI * 2);
            this.ctx.fillStyle = "rgba(76, 255, 80, 0.16)";
            this.ctx.fill();
        } else {
            state.player.renderRange(this.ctx, drawRange);
        }
    }

    drawPlayerAndTurrets(state) {
        state.player.render(this.ctx, this, state);
        for (const turret of state.turrets) {
            turret.render(this.ctx, state.player.x, state.player.y, state.player.radius, this);
        }
    }

    drawEntityBars(state) {
        for (const enemy of state.enemies) {
            if (!enemy.isDead) {
                enemy.renderStatusBars(this.ctx, this, state);
            }
        }
        state.player.renderStatusBars(this.ctx, this, state);
    }

    drawTargetMarkers(state) {
        if (state.player.queuedTargetX != null && state.player.queuedTargetY != null) {
            this._drawTargetMarker(this.ctx, state.player.queuedTargetX, state.player.queuedTargetY);
        } else if (state.player.isMoving && state.player.targetX !== null && state.player.targetY !== null) {
            this._drawTargetMarker(this.ctx, state.player.targetX, state.player.targetY);
        }
    }

    renderExplosions(state) {
        if (!state.explosions) return;
        for (const exp of state.explosions) {
            const canvasSize = exp.maxRadius * 2;
            if (canvasSize <= 0) continue;

            if (!exp.offCanvas) {
                exp.offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
                exp.offCtx = exp.offCanvas.getContext("2d");
            }

            const offCanvas = exp.offCanvas;
            const offCtx = exp.offCtx;
            const cx = exp.maxRadius;
            const cy = exp.maxRadius;

            offCtx.globalCompositeOperation = "source-over";
            offCtx.clearRect(0, 0, canvasSize, canvasSize);

            offCtx.beginPath();
            offCtx.arc(cx, cy, exp.radius, 0, Math.PI * 2);
            if (exp.phase === "expanding") {
                offCtx.fillStyle = "rgba(244, 67, 54, 0.6)";
                offCtx.fill();
            } else {
                offCtx.fillStyle = "rgba(139, 0, 0, 0.9)";
                offCtx.fill();
            }

            offCtx.globalCompositeOperation = "destination-out";
            offCtx.fillStyle = "#000000";
            offCtx.save();
            offCtx.translate(cx - exp.x, cy - exp.y);
            this.render3D.drawExplosion(exp.x, exp.y, exp.maxRadius, state, offCtx);
            offCtx.restore();

            this.ctx.save();
            if (exp.phase === "expanding") {
                this.ctx.globalCompositeOperation = "screen";
                this.ctx.globalAlpha = 1.0;
            } else {
                this.ctx.globalCompositeOperation = "source-over";
                this.ctx.globalAlpha = exp.opacity !== undefined ? exp.opacity : 1.0;
            }
            this.ctx.drawImage(offCanvas, exp.x - exp.maxRadius, exp.y - exp.maxRadius);
            this.ctx.restore();
        }
    }

    drawVisibilityMask(ctx, state, viewport) {
        const weaponRange = state.weapon.range;
        if (weaponRange > 0) {
            const maskRadius = (viewport && (state.phase === "combat" || state.phase === "map_transition" || state.phase === "reward")) ? (viewport.getVisualRadius() / viewport.zoom) : weaponRange;
            ctx.save();
            ctx.fillStyle = "#000000";
            ctx.beginPath();
            const cx = (viewport && (state.phase === "combat" || state.phase === "map_transition" || state.phase === "reward")) ? viewport.x : state.player.x;
            const cy = (viewport && (state.phase === "combat" || state.phase === "map_transition" || state.phase === "reward")) ? viewport.y : state.player.y;
            ctx.rect(cx - 10000, cy - 10000, 20000, 20000);
            ctx.arc(cx, cy, maskRadius, 0, Math.PI * 2);
            ctx.fill("evenodd");
            ctx.restore();
        }
    }

    _drawTargetMarker(ctx, x, y) {
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = "#4CAF50";
        ctx.lineWidth = 2;
        const size = 6;
        ctx.beginPath();
        ctx.moveTo(-size, -size);
        ctx.lineTo(size, size);
        ctx.moveTo(size, -size);
        ctx.lineTo(-size, size);
        ctx.stroke();
        ctx.restore();
    }

    drawDebugSpawnRadius(state) {
        const visualRadius = state.spawnRadius - 50;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(state.player.x - 10000, state.player.y - 10000, 20000, 20000);
        this.ctx.rect(state.player.x - visualRadius, state.player.y - visualRadius, visualRadius * 2, visualRadius * 2);
        this.ctx.fillStyle = "#000000";
        this.ctx.fill("evenodd");
        this.ctx.restore();
    }

    drawDebugFlowField(state) {
        const grid = state.flowFieldGrid;
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
        const baseSpawnX = state.mapBaseSpawnX !== undefined ? state.mapBaseSpawnX : (state.canvasBounds.width > 0 ? state.canvasBounds.width / 2 : 225);
        const baseSpawnY = state.mapBaseSpawnY !== undefined ? state.mapBaseSpawnY : (state.canvasBounds.height > 0 ? state.canvasBounds.height / 2 : 225);
        const scale = 7.0;

        const currentNode = state.mapNodes.find((n) => n.id === state.currentNodeId);
        for (const node of state.mapNodes) {
            for (const connId of node.connections) {
                const targetNode = state.mapNodes.find((n) => n.id === connId);
                if (!targetNode) continue;
                this.ctx.beginPath();
                this.ctx.moveTo(node.x, node.y);
                this.ctx.lineTo(targetNode.x, targetNode.y);
                this.ctx.lineWidth = 1.5;
                if (node.completed && (targetNode.completed || targetNode.id === state.currentNodeId)) {
                    this.ctx.strokeStyle = "rgba(76, 175, 80, 0.4)";
                } else if (node.id === state.currentNodeId) {
                    this.ctx.strokeStyle = "rgba(255, 235, 59, 0.5)";
                } else {
                    this.ctx.strokeStyle = "rgba(85, 85, 85, 0.3)";
                }
                this.ctx.stroke();
            }
        }

        for (const seg of state.walls) {
            if (seg.isDead) continue;

            const mx = (seg.x - baseSpawnX) / scale;
            const my = (seg.y - baseSpawnY) / scale;
            const msize = seg.size / scale;
            const mhalf = msize / 2;

            this.ctx.save();
            this.ctx.translate(mx, my);
            this.ctx.rotate(seg.angle);

            const theme = seg.theme || { r: 0, g: 188, b: 212 };
            this.ctx.fillStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, 0.75)`;
            this.ctx.fillRect(-mhalf, -mhalf, msize, msize);

            this.ctx.strokeStyle = `rgba(${theme.r}, ${theme.g}, ${theme.b}, 0.95)`;
            this.ctx.lineWidth = 0.5;
            this.ctx.strokeRect(-mhalf, -mhalf, msize, msize);

            this.ctx.restore();
        }

        const waveColors = ["#03A9F4", "#7E57C2", "#AB47BC", "#EC407A", "#F44336"];
        for (const node of state.mapNodes) {
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
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
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeStyle = "#FFF";
            this.ctx.stroke();
        }
    }


    drawOscilloscopeGrid(state, viewport) {
        const R = viewport.getVisualRadius();
        const cx = viewport.cx;
        const cy = viewport.cy;
        const zoom = viewport.zoom;

        this.ctx.save();
        this.ctx.strokeStyle = "rgba(0, 188, 212, 0.12)";
        this.ctx.lineWidth = 1.0;

        const gridSpacing = 40; 
        const worldRadius = R / zoom;

        const minX = viewport.x - worldRadius * 1.57;
        const maxX = viewport.x + worldRadius * 1.57;
        const minY = viewport.y - worldRadius * 1.57;
        const maxY = viewport.y + worldRadius * 1.57;

        const startX = Math.floor(minX / gridSpacing) * gridSpacing;
        const endX = Math.ceil(maxX / gridSpacing) * gridSpacing;
        const startY = Math.floor(minY / gridSpacing) * gridSpacing;
        const endY = Math.ceil(maxY / gridSpacing) * gridSpacing;

        const projectLens = (wx, wy) => {
            const dx = (wx - viewport.x) * zoom;
            const dy = (wy - viewport.y) * zoom;
            const d = Math.hypot(dx, dy);
            if (d === 0) return { x: cx, y: cy, visible: true };

            const maxD = R * (Math.PI / 2);
            if (d > maxD) {
                return { x: cx + (dx / d) * R, y: cy + (dy / d) * R, visible: false };
            }

            const rDome = R * Math.sin(d / R);
            const curvatureStrength = 0.45;
            const r = d * (1 - curvatureStrength) + rDome * curvatureStrength;

            return {
                x: cx + (dx / d) * r,
                y: cy + (dy / d) * r,
                visible: true
            };
        };

        for (let x = startX; x <= endX; x += gridSpacing) {
            this.ctx.beginPath();
            let first = true;
            for (let y = minY; y <= maxY; y += 8) {
                const pt = projectLens(x, y);
                if (pt.visible) {
                    if (first) {
                        this.ctx.moveTo(pt.x, pt.y);
                        first = false;
                    } else {
                        this.ctx.lineTo(pt.x, pt.y);
                    }
                } else {
                    first = true;
                }
            }
            this.ctx.stroke();
        }

        for (let y = startY; y <= endY; y += gridSpacing) {
            this.ctx.beginPath();
            let first = true;
            for (let x = minX; x <= maxX; x += 8) {
                const pt = projectLens(x, y);
                if (pt.visible) {
                    if (first) {
                        this.ctx.moveTo(pt.x, pt.y);
                        first = false;
                    } else {
                        this.ctx.lineTo(pt.x, pt.y);
                    }
                } else {
                    first = true;
                }
            }
            this.ctx.stroke();
        }

        this.ctx.restore();
    }


    drawGlobeOverlay(state, viewport) {
        if (!viewport) return;
        const R = viewport.getVisualRadius();
        const cx = viewport.cx;
        const cy = viewport.cy;

        this.ctx.save();

        const vignette = this.ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R);
        vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
        vignette.addColorStop(0.7, "rgba(0, 20, 30, 0.15)");
        vignette.addColorStop(0.95, "rgba(0, 30, 45, 0.5)");
        vignette.addColorStop(1.0, "rgba(0, 0, 0, 0.95)");

        this.ctx.fillStyle = vignette;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, R, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.strokeStyle = "rgba(0, 229, 255, 0.6)";
        this.ctx.lineWidth = 2.0;
        this.ctx.shadowColor = "#00bcd4";
        this.ctx.shadowBlur = 8;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, R, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;

        const borderOuter = R + 14;
        const bezelGrad = this.ctx.createRadialGradient(cx, cy, R, cx, cy, borderOuter);
        bezelGrad.addColorStop(0.0, "#0a0c10");
        bezelGrad.addColorStop(0.2, "#1b2028");
        bezelGrad.addColorStop(0.5, "#404c5e");
        bezelGrad.addColorStop(0.8, "#1b2028");
        bezelGrad.addColorStop(1.0, "#07080a");

        this.ctx.fillStyle = bezelGrad;
        this.ctx.strokeStyle = "#404c5e";
        this.ctx.lineWidth = 1.0;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, borderOuter, 0, Math.PI * 2);
        this.ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.save();
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 18) {
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const isMajor = (angle % (Math.PI / 2) === 0);
            const length = isMajor ? 8 : 4;
            if (isMajor) {
                this.ctx.strokeStyle = "rgba(0, 229, 255, 0.6)";
            } else {
                this.ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
            }
            this.ctx.moveTo(cx + cos * R, cy + sin * R);
            this.ctx.lineTo(cx + cos * (R + length), cy + sin * R);
        }
        this.ctx.stroke();
        this.ctx.restore();
        this.ctx.restore();
    }

    drawDebugHPA(state, viewport) {
        const hnav = state.hierarchicalNavigator;
        if (!hnav || !hnav.grid) return;
        if (!viewport) return;

        this.ctx.save();

        // Get visible world bounds
        const pad = hnav.cellSize * 2;
        const screenW = state.canvasBounds.width || this.canvas.width;
        const screenH = state.canvasBounds.height || this.canvas.height;
        const wMin = viewport.screenToWorld(0, 0);
        const wMax = viewport.screenToWorld(screenW, screenH);
        const vxMin = Math.min(wMin.x, wMax.x) - pad;
        const vxMax = Math.max(wMin.x, wMax.x) + pad;
        const vyMin = Math.min(wMin.y, wMax.y) - pad;
        const vyMax = Math.max(wMin.y, wMax.y) + pad;

        // Map visible bounds to grid cell ranges
        const startGrid = hnav.worldToGrid(vxMin, vyMin);
        const endGrid = hnav.worldToGrid(vxMax, vyMax);

        const startCol = Math.max(0, Math.min(hnav.cols - 1, startGrid.col));
        const endCol = Math.max(0, Math.min(hnav.cols - 1, endGrid.col));
        const startRow = Math.max(0, Math.min(hnav.rows - 1, startGrid.row));
        const endRow = Math.max(0, Math.min(hnav.rows - 1, endGrid.row));

        // 1. Draw Grid Cells & Voronoi Regions
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const isBlocked = hnav.grid[row * hnav.cols + col] === 1;
                const wx = hnav.minX + col * hnav.cellSize;
                const wy = hnav.minY + row * hnav.cellSize;

                if (isBlocked) {
                    this.ctx.fillStyle = "rgba(244, 67, 54, 0.25)"; // Translucent Red for blocked
                    this.ctx.fillRect(wx, wy, hnav.cellSize - 1, hnav.cellSize - 1);
                } else if (!hnav.cellToNode || !hnav.cellToNode[row * hnav.cols + col]) {
                    this.ctx.fillStyle = "rgba(76, 175, 80, 0.05)"; // Very Faint Green for unassigned/fallback
                    this.ctx.fillRect(wx, wy, hnav.cellSize - 1, hnav.cellSize - 1);
                }
            }
        }

        // Draw Region Perimeters
        if (hnav.cellToNode) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = "rgba(0, 229, 255, 0.5)"; // Translucent Cyan for borders
            this.ctx.lineWidth = 1.5;

            for (let row = startRow; row <= endRow; row++) {
                for (let col = startCol; col <= endCol; col++) {
                    const idx = row * hnav.cols + col;
                    if (hnav.grid[idx] === 1) continue;

                    const node = hnav.cellToNode[idx];
                    if (!node) continue;

                    const wx = hnav.minX + col * hnav.cellSize;
                    const wy = hnav.minY + row * hnav.cellSize;
                    const cellSize = hnav.cellSize;

                    // Check Right Neighbor
                    if (col + 1 < hnav.cols) {
                        const rIdx = idx + 1;
                        if (hnav.grid[rIdx] === 0) {
                            const rightNode = hnav.cellToNode[rIdx];
                            if (rightNode && rightNode.id !== node.id) {
                                this.ctx.moveTo(wx + cellSize, wy);
                                this.ctx.lineTo(wx + cellSize, wy + cellSize);
                            }
                        }
                    }

                    // Check Bottom Neighbor
                    if (row + 1 < hnav.rows) {
                        const bIdx = idx + hnav.cols;
                        if (hnav.grid[bIdx] === 0) {
                            const bottomNode = hnav.cellToNode[bIdx];
                            if (bottomNode && bottomNode.id !== node.id) {
                                this.ctx.moveTo(wx, wy + cellSize);
                                this.ctx.lineTo(wx + cellSize, wy + cellSize);
                            }
                        }
                    }
                }
            }
            this.ctx.stroke();
        }

        // 2. Draw HPA* Abstract Nodes & Edges
        for (const id in hnav.nodesMap) {
            const node = hnav.nodesMap[id];
            // Draw edges
            for (const edge of node.edges) {
                const targetNode = hnav.nodesMap[edge.targetId];
                if (targetNode) {
                    if (edge.path && edge.path.length > 0) {
                        this.ctx.beginPath();
                        const p0 = hnav.gridToWorld(edge.path[0].col, edge.path[0].row);
                        this.ctx.moveTo(p0.x, p0.y);
                        for (let k = 1; k < edge.path.length; k++) {
                            const pk = hnav.gridToWorld(edge.path[k].col, edge.path[k].row);
                            this.ctx.lineTo(pk.x, pk.y);
                        }
                        this.ctx.strokeStyle = "#ff9800";
                        this.ctx.lineWidth = 2.5;
                        this.ctx.stroke();
                    } else {
                        this.ctx.beginPath();
                        this.ctx.moveTo(node.x, node.y);
                        this.ctx.lineTo(targetNode.x, targetNode.y);
                        this.ctx.strokeStyle = "#ff9800";
                        this.ctx.lineWidth = 2.5;
                        this.ctx.stroke();
                    }
                }
            }

            // Draw node
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
            this.ctx.fillStyle = "#00e5ff";
            this.ctx.fill();
        }

        // 4. Draw Waypoint Paths for Enemies
        for (const enemy of state.enemies) {
            if (enemy.isDead) continue;
            if (enemy.hpaPath && enemy.hpaPath.length > 0) {
                this.ctx.beginPath();
                this.ctx.moveTo(enemy.x, enemy.y);
                for (const wp of enemy.hpaPath) {
                    this.ctx.lineTo(wp.x, wp.y);
                }
                this.ctx.strokeStyle = "#ff007f";
                this.ctx.lineWidth = 2.5;
                this.ctx.stroke();

                // Draw circles on waypoints
                for (const wp of enemy.hpaPath) {
                    this.ctx.beginPath();
                    this.ctx.arc(wp.x, wp.y, 4, 0, Math.PI * 2);
                    this.ctx.fillStyle = "#ff007f";
                    this.ctx.fill();
                }
            }
        }

        // 5. Draw Waypoint Path for Player
        if (state.player && state.player.hpaPath && state.player.hpaPath.length > 0) {
            this.ctx.beginPath();
            this.ctx.moveTo(state.player.x, state.player.y);
            for (const wp of state.player.hpaPath) {
                this.ctx.lineTo(wp.x, wp.y);
            }
            this.ctx.strokeStyle = "#00e5ff";
            this.ctx.lineWidth = 2.5;
            this.ctx.stroke();

            // Draw circles on waypoints
            for (const wp of state.player.hpaPath) {
                this.ctx.beginPath();
                this.ctx.arc(wp.x, wp.y, 4, 0, Math.PI * 2);
                this.ctx.fillStyle = "#00e5ff";
                this.ctx.fill();
            }
        }

        this.ctx.restore();
    }
}