import { SpriteCache } from "./SpriteCache.js";
import { Render3D } from "./3D/Render3D.js";
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
        this.render3D = new Render3D();
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
        const drawRange = (viewport && state.phase === "combat") ? (viewport.getVisualRadius() / viewport.zoom) : state.weapon.range;
        RenderStrategies.planet(this.ctx, state.planet, drawRange);

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
        this.render3D.draw3DBuildings(this.ctx, state, viewport);

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

    drawExplosion(px, py, maxDist, state, targetCtx) {
        this.render3D.drawExplosion(px, py, maxDist, state, targetCtx);
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