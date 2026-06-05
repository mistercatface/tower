import "./WorldSurfaceBootstrap.js";
import { SpriteCache } from "../Libraries/Canvas/SpriteCache.js";
import { Render3D } from "./3D/Render3D.js";
import { buildWorldRenderInput } from "./adapters/WorldRenderAdapter.js";
import { COMBAT_HUD_MODE, hudSettings, combatVisualSettings } from "../Config/Config.js";
import { getWorldDrawCoords, isMapTraveling, isWorldScene } from "../GameState/GamePhase.js";
import { getPlayerActors } from "../Combat/Targeting.js";
import { drawHostileOffScreenIndicators } from "./OffScreenIndicators.js";
import { CombatParticles } from "./CombatParticles.js";
import { renderMapView } from "./Map/MapViewRenderer.js";
import { createGameMapViewConfig } from "./Map/mapViewPresets.js";

export class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.actorCache = new SpriteCache();
        this.turretCache = new SpriteCache();
        this.floatingTextCache = new SpriteCache();
        this.render3D = new Render3D();
        this.effectPasses = [
            { zIndex: -5, fn: (state, viewport) => state.worldSurfaces.drawGround(this.ctx, state, viewport) },
            { zIndex: 19, fn: (state, viewport) => this.drawDebris(state, viewport) },
            {
                zIndex: 30,
                fn: (state, viewport) => {
                    for (const actor of state.getHostileActors()) {
                        this.drawActorAndTurrets(actor, state, viewport);
                    }
                },
            },
            {
                zIndex: 50,
                fn: (state, viewport) => {
                    for (const actor of getPlayerActors(state)) {
                        this.drawActorAndTurrets(actor, state, viewport);
                    }
                },
            },
            { zIndex: 60, fn: (state, viewport) => this.renderExplosions(state, viewport) },
            { zIndex: 70, fn: (state, viewport) => this.render3D.draw3DBuildings(this.ctx, buildWorldRenderInput(state), viewport) },
            {
                zIndex: 74,
                fn: (state, viewport) => {
                    if (combatVisualSettings.bloom?.enabled) {
                        this.ctx.save();
                        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                        this.ctx.globalCompositeOperation = "screen";
                        this.ctx.filter = `blur(${combatVisualSettings.bloom.blur}px)`;
                        this.ctx.drawImage(this.canvas, 0, 0);
                        this.ctx.restore();
                    }
                },
            },
            { zIndex: 75, fn: (state, viewport) => this.drawEntityBars(state, viewport) },
            { zIndex: 80, fn: (state, viewport) => this.drawVisibilityMask(this.ctx, state, viewport) },
            { zIndex: 85, fn: (state, viewport) => this.drawTargetMarkers(state, viewport) },
            { zIndex: 86, fn: (state, viewport) => this.drawCombatHudOverlay(state, viewport) },
        ];
    }

    renderMapScene(state, viewport) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        renderMapView(this.ctx, state, {
            ...createGameMapViewConfig(),
            viewport,
            clearBackground: false,
        });

        const oldX = state.player.x;
        const oldY = state.player.y;
        state.player.x = state.mapPlayerX;
        state.player.y = state.mapPlayerY;
        this.drawActorAndTurrets(state.player, state, null);

        state.player.x = oldX;
        state.player.y = oldY;

        this.renderEntityCollection(state.floatingTexts, state);
        this.ctx.restore();
    }

    buildCombatPipeline(state, viewport) {
        const entityPasses = state.entityLayers.map((layer) => ({ zIndex: layer.zIndex, fn: (state, viewport) => this.renderEntityCollection(state[layer.key], state, viewport) }));

        const pipeline = [...this.effectPasses, ...entityPasses];
        pipeline.sort((a, b) => a.zIndex - b.zIndex);
        this._combatPipeline = pipeline.map((p) => p.fn);
    }

    renderCombatScene(state, viewport) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (viewport) viewport.apply(this.ctx);

        this.buildCombatPipeline(state, viewport);

        for (let i = 0; i < this._combatPipeline.length; i++) {
            this._combatPipeline[i](state, viewport);
        }

        if (isMapTraveling(state)) {
            this.drawTransitionGuides(state);
        }

        if (state.debugMode) {
            this.drawDebugHPA(state, viewport);
        }

        this.ctx.restore();

        CombatParticles.renderAll(this.ctx, state, viewport);

        if (viewport && isWorldScene(state.phase)) {
            this.drawGlobeOverlay(state, viewport);
            drawHostileOffScreenIndicators(this.ctx, state, viewport);
        }
    }

    drawDebris(state, viewport) {
        if (!state.pickups) return;
        const px = state.player.x;
        const py = state.player.y;
        for (let i = 0; i < state.pickups.length; i++) {
            const p = state.pickups[i];
            if (p.isDead || p.strategy?.renderMode !== "debris") continue;
            if (viewport && typeof p.isVisible === "function" && !p.isVisible(viewport)) continue;
            this.render3D.drawProp(this.ctx, p, px, py);
        }
    }

    drawTransitionGuides(state) {
        const prevNode = state.getCurrentMapNode();
        const targetNode = state.getMapTargetNode();
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

    renderEntityCollection(collection, state, viewport) {
        if (!collection) return;
        for (const entity of collection) {
            if (viewport && typeof entity.isVisible === "function" && !entity.isVisible(viewport)) {
                continue;
            }
            entity.render(this.ctx, this, state);
        }
    }

    drawActorAndTurrets(actor, state, viewport) {
        if (!actor || actor.isDead) return;
        if (viewport && typeof actor.isVisible === "function" && !actor.isVisible(viewport)) {
            return;
        }
        if (state.combatHudMode === COMBAT_HUD_MODE.CLASSIC) {
            actor.renderCombatHudClassic(this.ctx, this);
            return;
        }
        actor.render(this.ctx, this, state);
    }

    drawCombatHudOverlay(state, viewport) {
        if (state.combatHudMode !== COMBAT_HUD_MODE.OVERLAY) return;
        for (const actor of state.getCombatants()) {
            if (actor.isDead) continue;
            if (viewport && typeof actor.isVisible === "function" && !actor.isVisible(viewport)) {
                continue;
            }
            this.ctx.save();
            this.ctx.globalAlpha = hudSettings.combatOverlayAlpha;
            actor.renderCombatHudClassic(this.ctx, this);
            this.ctx.restore();
        }
    }

    drawEntityBars(state, viewport) {
        for (const actor of state.getCombatants()) {
            if (viewport && typeof actor.isVisible === "function" && !actor.isVisible(viewport)) {
                continue;
            }
            actor.renderStatusBars(this.ctx, this, state);
        }
    }

    drawTargetMarkers(state, viewport) {
        if (state.player.queuedTargetX != null && state.player.queuedTargetY != null) {
            if (!viewport || viewport.isVisible(state.player.queuedTargetX, state.player.queuedTargetY, 6)) {
                this._drawTargetMarker(this.ctx, state.player.queuedTargetX, state.player.queuedTargetY);
            }
        } else if (state.player.isMoving && state.player.targetX !== null && state.player.targetY !== null) {
            if (!viewport || viewport.isVisible(state.player.targetX, state.player.targetY, 6)) {
                this._drawTargetMarker(this.ctx, state.player.targetX, state.player.targetY);
            }
        }
    }

    renderExplosions(state, viewport) {
        if (!state.explosions) return;
        for (const exp of state.explosions) {
            if (viewport && !viewport.isVisible(exp.x, exp.y, exp.maxRadius)) {
                continue;
            }
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
            if (exp.currentPhase?.brightFill) {
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
            this.render3D.drawExplosion(exp.x, exp.y, exp.maxRadius, buildWorldRenderInput(state), offCtx);
            offCtx.restore();

            this.ctx.save();
            if (exp.currentPhase?.screenBlend) {
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
        const weaponRange = state.player.weapon.range;
        if (weaponRange > 0) {
            const { range: maskRadius, x: cx, y: cy } = getWorldDrawCoords(state, viewport, weaponRange);
            ctx.save();
            ctx.fillStyle = "#000000";
            ctx.beginPath();
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

    drawGlobeOverlay(state, viewport) {
        if (!viewport) return;
        const R = viewport.getVisualRadius();
        const cx = viewport.cx;
        const cy = viewport.cy;

        this.ctx.save();

        this.ctx.fillStyle = "#000000";
        this.ctx.beginPath();
        this.ctx.rect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
        this.ctx.fill("evenodd");

        this.ctx.restore();
    }

    drawNavigationDebugLabel(entity, navigation, color = "#ffffff") {
        const info = navigation.getDebugInfo(entity);
        if (!info) return;

        const replanText = info.replanReason ? ` ${info.replanReason}` : "";
        const label = `${info.mode} d=${Math.round(info.dist)} p=${info.pathLen}${replanText}`;

        this.ctx.save();
        this.ctx.font = "9px monospace";
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = color;
        this.ctx.fillText(label, entity.x, entity.y - entity.radius - 8);
        this.ctx.restore();
    }

    drawEntityNavigationPath(entity, path, strokeStyle, fillStyle) {
        if (!path || path.length === 0) return;

        this.ctx.beginPath();
        this.ctx.moveTo(entity.x, entity.y);
        for (const wp of path) {
            this.ctx.lineTo(wp.x, wp.y);
        }
        this.ctx.strokeStyle = strokeStyle;
        this.ctx.lineWidth = 2.5;
        this.ctx.stroke();

        for (const wp of path) {
            this.ctx.beginPath();
            this.ctx.arc(wp.x, wp.y, 4, 0, Math.PI * 2);
            this.ctx.fillStyle = fillStyle;
            this.ctx.fill();
        }
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
                    this.ctx.fillRect(wx, wy, hnav.cellSize, hnav.cellSize);
                } else if (!hnav.cellToNode || !hnav.cellToNode[row * hnav.cols + col]) {
                    this.ctx.fillStyle = "rgba(76, 175, 80, 0.05)"; // Very Faint Green for unassigned/fallback
                    this.ctx.fillRect(wx, wy, hnav.cellSize, hnav.cellSize);
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

        // 4. Draw Waypoint Paths and navigation debug for entities
        const navigation = state.navigation;
        if (navigation) {
            for (const actor of state.getCombatants()) {
                const color = actor.faction === "player" ? "#00e5ff" : "#ff007f";
                const path = navigation.getPath(actor);
                this.drawEntityNavigationPath(actor, path, color, color);
                this.drawNavigationDebugLabel(actor, navigation, color);
            }
        }

        this.ctx.restore();
    }
}
