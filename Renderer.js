import { ChunkManager } from "./ChunkManager.js";

export class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.enemyCache = new Map();
        this.missileCache = new Map();
        this.chunkManager = new ChunkManager();
    }

    drawPickup(pickup) {
        if (!pickup.cachedSprite) {
            const canvasSize = pickup.radius * 2 + 4;
            const cx = canvasSize / 2;
            const cy = canvasSize / 2;
            const offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
            const offCtx = offCanvas.getContext("2d");

            if (pickup.type === "coin") {
                offCtx.beginPath();
                offCtx.arc(cx, cy, pickup.radius, 0, Math.PI * 2);
                offCtx.fillStyle = "#FFEB3B";
                offCtx.fill();
                offCtx.lineWidth = 1;
                offCtx.strokeStyle = "#FBC02D";
                offCtx.stroke();

                offCtx.fillStyle = "#000";
                offCtx.font = "10px monospace";
                offCtx.textAlign = "center";
                offCtx.textBaseline = "middle";
                offCtx.fillText("$", cx, cy + 1);
            } else if (pickup.type === "eyeball") {
                offCtx.beginPath();
                offCtx.arc(cx, cy, pickup.radius * 0.5, 0, Math.PI * 2);
                offCtx.fillStyle = "#2196F3";
                offCtx.fill();

                offCtx.beginPath();
                offCtx.arc(cx, cy, pickup.radius * 0.25, 0, Math.PI * 2);
                offCtx.fillStyle = "#000000";
                offCtx.fill();
            }
            pickup.cachedSprite = offCanvas;
        }

        this.ctx.save();
        this.ctx.translate(pickup.x, pickup.y);
        this.ctx.drawImage(pickup.cachedSprite, -pickup.cachedSprite.width / 2, -pickup.cachedSprite.height / 2);
        this.ctx.restore();
    }

    render(state, viewport) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (viewport) {
            viewport.apply(this.ctx);
        }

        if (state.phase === "map" || state.phase === "map_transition") {
            this.drawMap(state);

            const tempPlanet = { ...state.planet, x: state.mapPlayerX, y: state.mapPlayerY };
            this.drawPlanet(tempPlanet, 0);
            
            for (const turret of state.turrets) {
                this.drawTurret(turret, state.mapPlayerX, state.mapPlayerY, state.planet.radius, 0, 1);
            }
        } else {
            this.drawPlanet(state.planet, state.weapon.range);

            if (state.planet.queuedTargetX != null && state.planet.queuedTargetY != null) {
                this.drawTargetMarker(state.planet.queuedTargetX, state.planet.queuedTargetY);
            } else if (state.planet.isMoving && state.planet.targetX !== null && state.planet.targetY !== null) {
                this.drawTargetMarker(state.planet.targetX, state.planet.targetY);
            }

            this.drawShadows(state);

            for (const p of state.pickups) this.drawPickup(p);
            
            for (const e of state.enemies) {
                this.drawEnemy(e);
                this.drawTurret(e.turret, e.x, e.y, e.radius, 0, 1, e.color);
            }

            for (const p of state.projectiles) this.drawMissile(p, p.faction === "player" ? "#FFEB3B" : "#F44336");

            this.chunkManager.drawWalls(this.ctx, state);

            if (state.activeLasers) {
                for (const laser of state.activeLasers) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(laser.x1, laser.y1);
                    this.ctx.lineTo(laser.x2, laser.y2);
                    this.ctx.strokeStyle = "#ff0000";
                    this.ctx.lineWidth = 3;
                    this.ctx.stroke();
                    this.ctx.strokeStyle = "#FFFFFF";
                    this.ctx.lineWidth = 1;
                    this.ctx.stroke();
                }
            }

            this.drawPlanet(state.planet, 0);
            
            for (const turret of state.turrets) {
                this.drawTurret(turret, state.planet.x, state.planet.y, state.planet.radius, turret.charge, state.weapon.chargeTime);
            }
        }

        for (const ft of state.floatingTexts) this.drawFloatingText(ft);

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

    drawShadows(state) {
        const px = state.planet.x;
        const py = state.planet.y;
        const radius = 3000;

        this.ctx.save();
        this.ctx.fillStyle = "#000000";

        for (const seg of state.walls) {
            if (seg.isDead) continue;

            const dist = Math.hypot(seg.x - px, seg.y - py);
            if (dist > 1500) continue;

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

            for (const edge of edges) {
                const p1 = edge[0];
                const p2 = edge[1];

                const edgeCx = (p1.x + p2.x) / 2;
                const edgeCy = (p1.y + p2.y) / 2;
                const outX = edgeCx - seg.x;
                const outY = edgeCy - seg.y;
                const viewX = edgeCx - px;
                const viewY = edgeCy - py;

                if (outX * viewX + outY * viewY < 0) continue;

                let angle1 = Math.atan2(p1.y - py, p1.x - px);
                let angle2 = Math.atan2(p2.y - py, p2.x - px);

                const cross = (p1.x - px) * (p2.y - py) - (p1.y - py) * (p2.x - px);
                const spread = 0.02;

                if (cross > 0) {
                    angle1 -= spread;
                    angle2 += spread;
                } else {
                    angle1 += spread;
                    angle2 -= spread;
                }

                const proj1 = { x: p1.x + Math.cos(angle1) * radius, y: p1.y + Math.sin(angle1) * radius };
                const proj2 = { x: p2.x + Math.cos(angle2) * radius, y: p2.y + Math.sin(angle2) * radius };

                this.ctx.beginPath();
                this.ctx.moveTo(p1.x, p1.y);
                this.ctx.lineTo(proj1.x, proj1.y);
                this.ctx.lineTo(proj2.x, proj2.y);
                this.ctx.lineTo(p2.x, p2.y);
                this.ctx.closePath();
                this.ctx.fill();
            }
        }
        this.ctx.restore();
    }

    drawTargetMarker(x, y) {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.strokeStyle = "#4CAF50";
        this.ctx.lineWidth = 2;

        const size = 6;
        this.ctx.beginPath();
        this.ctx.moveTo(-size, -size);
        this.ctx.lineTo(size, size);
        this.ctx.moveTo(size, -size);
        this.ctx.lineTo(-size, size);
        this.ctx.stroke();

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

    drawPlanet(planet, weaponRange) {
        if (planet.spawnX !== undefined && planet.spawnY !== undefined && weaponRange > 0) {
            this.ctx.beginPath();
            this.ctx.arc(planet.spawnX, planet.spawnY, weaponRange, 0, Math.PI * 2);
            this.ctx.strokeStyle = "rgba(150, 150, 150, 0.5)";
            this.ctx.lineWidth = 1.5;
            this.ctx.setLineDash([8, 8]);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        if (weaponRange > 0) {
            this.ctx.beginPath();
            this.ctx.arc(planet.x, planet.y, weaponRange, 0, Math.PI * 2);
            this.ctx.fillStyle = "rgba(76, 175, 80, 0.08)";
            this.ctx.fill();
        }

        this.ctx.beginPath();
        this.ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = "#4CAF50";
        this.ctx.fill();
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

    drawTurret(turret, planetX, planetY, planetRadius, weaponCharge, weaponChargeTime, explicitColor = null) {
        const turretDist = planetRadius + 4;
        const tx = planetX + Math.cos(turret.angle) * turretDist;
        const ty = planetY + Math.sin(turret.angle) * turretDist;

        this.ctx.save();
        this.ctx.translate(tx, ty);
        this.ctx.rotate(turret.angle);

        const scale = planetRadius / 8;
        this.ctx.scale(scale, scale);

        const turretPoints = [
            { x: 4, y: 0 },
            { x: -2, y: 2.5 },
            { x: -2, y: -2.5 },
            { x: 4, y: 0 },
        ];

        this.ctx.beginPath();
        this.ctx.moveTo(turretPoints[0].x, turretPoints[0].y);
        this.ctx.lineTo(turretPoints[1].x, turretPoints[1].y);
        this.ctx.lineTo(turretPoints[2].x, turretPoints[2].y);
        this.ctx.closePath();
        this.ctx.fillStyle = explicitColor || "#4CAF50";
        this.ctx.fill();

        let progress = 1;
        let strokeColor = explicitColor || "#4CAF50";

        if (weaponCharge > 0) {
            progress = weaponCharge / weaponChargeTime;
            strokeColor = "#ff0000";
        }

        if (progress > 0) {
            this.ctx.beginPath();
            this.ctx.moveTo(turretPoints[0].x, turretPoints[0].y);

            let targetLen = progress * 18;

            for (let i = 0; i < 3; i++) {
                const p1 = turretPoints[i];
                const p2 = turretPoints[i + 1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const segLen = Math.hypot(dx, dy);

                if (targetLen >= segLen) {
                    this.ctx.lineTo(p2.x, p2.y);
                    targetLen -= segLen;
                } else {
                    const ratio = targetLen / segLen;
                    this.ctx.lineTo(p1.x + dx * ratio, p1.y + dy * ratio);
                    break;
                }
            }

            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 1;
            this.ctx.lineJoin = "round";
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawEnemy(enemy) {
        const cacheKey = `${enemy.radius}_${enemy.color}`;

        let cachedSprite = this.enemyCache.get(cacheKey);
        if (!cachedSprite) {
            const canvasSize = Math.ceil(enemy.radius * 2.5) * 2;
            const cx = canvasSize / 2;
            const cy = canvasSize / 2;

            cachedSprite = new OffscreenCanvas(canvasSize, canvasSize);
            const offCtx = cachedSprite.getContext("2d");

            offCtx.beginPath();
            offCtx.arc(cx, cy, enemy.radius, 0, Math.PI * 2);
            offCtx.fillStyle = enemy.color;
            offCtx.fill();

            this.enemyCache.set(cacheKey, cachedSprite);
        }

        this.ctx.save();
        this.ctx.translate(enemy.x, enemy.y);
        this.ctx.rotate(enemy.angle);
        this.ctx.drawImage(cachedSprite, -cachedSprite.width / 2, -cachedSprite.height / 2);
        this.ctx.restore();

        if (enemy.health < enemy.maxHealth) {
            this.ctx.fillStyle = "#FFF";
            const currentHealth = Math.max(0, enemy.health);
            this.ctx.fillRect(enemy.x - 10, enemy.y - 12, 20 * (currentHealth / enemy.maxHealth), 3);
        }
    }

    drawMissile(missile, color) {
        const cacheKey = `${missile.radius}_${color}`;
        let cachedSprite = this.missileCache.get(cacheKey);
        if (!cachedSprite) {
            const canvasSize = Math.ceil(missile.radius * 2);
            const cx = canvasSize / 2;
            const cy = canvasSize / 2;
            cachedSprite = new OffscreenCanvas(canvasSize, canvasSize);
            const offCtx = cachedSprite.getContext("2d");
            offCtx.beginPath();
            offCtx.arc(cx, cy, missile.radius, 0, Math.PI * 2);
            offCtx.fillStyle = color;
            offCtx.fill();
            this.missileCache.set(cacheKey, cachedSprite);
        }
        this.ctx.save();
        this.ctx.translate(missile.x, missile.y);
        this.ctx.drawImage(cachedSprite, -cachedSprite.width / 2, -cachedSprite.height / 2);
        this.ctx.restore();
    }

    drawFloatingText(ft) {
        this.ctx.globalAlpha = Math.max(0, ft.life);
        this.ctx.fillStyle = ft.color;
        this.ctx.font = "12px monospace";
        this.ctx.fillText(ft.text, Math.round(ft.x), Math.round(ft.y));
        this.ctx.globalAlpha = 1.0;
    }
}