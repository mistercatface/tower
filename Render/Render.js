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
        this.planetCache = new SpriteCache();
        this.render3D = new Render3D();
        this.effectPasses = [
            { zIndex: 0,  fn: (state, viewport) => this.drawRangeIndicator(state, viewport) },
            { zIndex: 50, fn: (state) => this.drawPlanetAndTurrets(state) },
            { zIndex: 60, fn: (state) => this.renderExplosions(state) },
            { zIndex: 70, fn: (state, viewport) => this.render3D.draw3DBuildings(this.ctx, state, viewport) },
            { zIndex: 80, fn: (state, viewport) => this.drawVisibilityMask(this.ctx, state, viewport) },
            { zIndex: 85, fn: (state) => this.drawTargetMarkers(state) },
        ];
    }

    renderMapScene(state, viewport) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (viewport) viewport.apply(this.ctx);
        this.drawMap(state);

        const oldX = state.planet.x;
        const oldY = state.planet.y;
        state.planet.x = state.mapPlayerX;
        state.planet.y = state.mapPlayerY;
        state.planet.render(this.ctx, this);

        for (const turret of state.turrets) {
            turret.render(this.ctx, state.mapPlayerX, state.mapPlayerY, state.planet.radius, this);
        }

        state.planet.x = oldX;
        state.planet.y = oldY;

        this.renderEntityCollection(state.floatingTexts);
        this.ctx.restore();
    }

    buildCombatPipeline(state, viewport) {
        const entityPasses = state.entityLayers.map(layer => ({
            zIndex: layer.zIndex,
            fn: (state) => this.renderEntityCollection(state[layer.key])
        }));

        const pipeline = [...this.effectPasses, ...entityPasses];
        pipeline.sort((a, b) => a.zIndex - b.zIndex);
        this._combatPipeline = pipeline.map(p => p.fn);
    }

    renderCombatScene(state, viewport) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (viewport) viewport.apply(this.ctx);

        if (!this._combatPipeline) {
            this.buildCombatPipeline(state, viewport);
        }

        for (let i = 0; i < this._combatPipeline.length; i++) {
            this._combatPipeline[i](state, viewport);
        }

        this.ctx.restore();
    }

    renderEntityCollection(collection) {
        if (!collection) return;
        for (const entity of collection) {
            entity.render(this.ctx, this);
        }
    }

    drawRangeIndicator(state, viewport) {
        const drawRange = (viewport && state.phase === "combat") ? (viewport.getVisualRadius() / viewport.zoom) : state.weapon.range;
        state.planet.renderRange(this.ctx, drawRange);
    }

    drawPlanetAndTurrets(state) {
        state.planet.render(this.ctx, this);
        for (const turret of state.turrets) {
            turret.render(this.ctx, state.planet.x, state.planet.y, state.planet.radius, this);
        }
    }

    drawTargetMarkers(state) {
        if (state.planet.queuedTargetX != null && state.planet.queuedTargetY != null) {
            this._drawTargetMarker(this.ctx, state.planet.queuedTargetX, state.planet.queuedTargetY);
        } else if (state.planet.isMoving && state.planet.targetX !== null && state.planet.targetY !== null) {
            this._drawTargetMarker(this.ctx, state.planet.targetX, state.planet.targetY);
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
            const maskRadius = (viewport && state.phase === "combat") ? (viewport.getVisualRadius() / viewport.zoom) : weaponRange;
            ctx.save();
            ctx.fillStyle = "#000000";
            ctx.beginPath();
            ctx.rect(state.planet.x - 10000, state.planet.y - 10000, 20000, 20000);
            ctx.arc(state.planet.x, state.planet.y, maskRadius, 0, Math.PI * 2);
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
        this.ctx.rect(state.planet.x - 10000, state.planet.y - 10000, 20000, 20000);
        this.ctx.rect(state.planet.x - visualRadius, state.planet.y - visualRadius, visualRadius * 2, visualRadius * 2);
        this.ctx.fillStyle = "#000000";
        this.ctx.fill("evenodd");
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