import { getGameWorldSurfaceSettings } from "./WorldSurfaceBootstrap.js";
import { SpriteCache } from "../Libraries/Canvas/SpriteCache.js";
import { WorldSceneRenderer } from "../Libraries/Render/WorldSceneRenderer.js";
import { getRenderPorts } from "../Core/GamePorts.js";
import { buildWorldRenderInput } from "./adapters/WorldRenderAdapter.js";
import { CombatParticles } from "./CombatParticles.js";
import { renderMapView } from "./Map/MapViewRenderer.js";
import { createGameMapViewConfig } from "./Map/mapViewPresets.js";
import { drawWorldScene } from "./worldSceneDraw.js";
export class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.actorCache = new SpriteCache();
        this.turretCache = new SpriteCache();
        this.floatingTextCache = new SpriteCache();
        this.render3D = new WorldSceneRenderer(getGameWorldSurfaceSettings(), getRenderPorts().world3dPropRecipes);
        this.effectPasses = [
            { zIndex: -5, fn: (state, viewport) => drawWorldScene(this.ctx, { state, viewport, worldSceneRenderer: this.render3D, phases: ["ground"] }) },
            {
                zIndex: 70,
                fn: (state, viewport) =>
                    drawWorldScene(this.ctx, {
                        state,
                        viewport,
                        worldSceneRenderer: this.render3D,
                        canvas: this.canvas,
                        worldRenderInput: this.getWorldRenderInput(state, viewport),
                        phases: ["buildings", "roofs", "bloom"],
                    }),
            },
        ];
    }
    renderMapScene(state, viewport) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        renderMapView(this.ctx, state, { ...createGameMapViewConfig(), viewport, clearBackground: false });
        const oldX = state.player.x;
        const oldY = state.player.y;
        const { x: mapX, y: mapY } = state.getMapPlayerGraphCoords();
        state.player.x = mapX;
        state.player.y = mapY;
        this.drawActorAndTurrets(state.player, state, null);
        state.player.x = oldX;
        state.player.y = oldY;
        this.renderEntityCollection(state.floatingTexts, state);
        this.ctx.restore();
    }
    buildSimulationPipeline(state, viewport) {
        const entityPasses = (state.entityLayers ?? []).map((layer) => ({ zIndex: layer.zIndex, fn: (state, viewport) => this.renderEntityCollection(state[layer.key], state, viewport) }));
        const enabledEffects = this.effectPasses;
        const portPasses = (getRenderPorts().simulationEffectPasses ?? []).map((pass) => ({ zIndex: pass.zIndex, fn: (state, viewport) => pass.draw(state, viewport, this.ctx, this) }));
        const pipeline = [...enabledEffects, ...portPasses, ...entityPasses];
        pipeline.sort((a, b) => a.zIndex - b.zIndex);
        this._simulationPipeline = pipeline.map((p) => p.fn);
    }
    /** Cached once per simulation frame — walls share the same draw input. */
    getWorldRenderInput(state, viewport) {
        if (!this._frameWorldRenderInput) this._frameWorldRenderInput = buildWorldRenderInput(state, viewport);
        return this._frameWorldRenderInput;
    }
    renderSimulationScene(state, viewport) {
        this._frameWorldRenderInput = null;
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (viewport) viewport.apply(this.ctx);
        this.buildSimulationPipeline(state, viewport);
        for (let i = 0; i < this._simulationPipeline.length; i++) this._simulationPipeline[i](state, viewport);
        if (state.debugMode) this.drawDebugHPA(state, viewport);
        this.ctx.restore();
        CombatParticles.renderAll(this.ctx, state, viewport);
        getRenderPorts().drawPostSimulation?.(state, viewport, this.ctx, this);
    }
    renderEntityCollection(collection, state, viewport) {
        if (!collection) return;
        for (const entity of collection) {
            if (viewport && typeof entity.isVisible === "function" && !entity.isVisible(viewport)) continue;
            entity.render(this.ctx, this, state);
        }
    }
    drawActorAndTurrets(actor, state, viewport) {
        if (!actor || actor.isDead) return;
        if (viewport && typeof actor.isVisible === "function" && !actor.isVisible(viewport)) return;
        actor.render(this.ctx, this, state);
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
        for (const wp of path) this.ctx.lineTo(wp.x, wp.y);
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
        for (let row = startRow; row <= endRow; row++)
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
        // Draw Region Perimeters
        if (hnav.cellToNode) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = "rgba(0, 229, 255, 0.5)"; // Translucent Cyan for borders
            this.ctx.lineWidth = 1.5;
            for (let row = startRow; row <= endRow; row++)
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
            this.ctx.stroke();
        }
        // 2. Draw HPA* Abstract Nodes & Edges
        for (const id in hnav.nodesMap) {
            const node = hnav.nodesMap[id];
            // Draw edges
            for (const edge of node.edges) {
                const targetNode = hnav.nodesMap[edge.targetId];
                if (targetNode)
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
            // Draw node
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
            this.ctx.fillStyle = "#00e5ff";
            this.ctx.fill();
        }
        // 4. Draw Waypoint Paths and navigation debug for entities
        const navigation = state.navigation;
        if (navigation)
            for (const actor of state.getCombatants()) {
                const color = actor.faction === "player" ? "#00e5ff" : "#ff007f";
                const path = navigation.getPath(actor);
                this.drawEntityNavigationPath(actor, path, color, color);
                this.drawNavigationDebugLabel(actor, navigation, color);
            }
        this.ctx.restore();
    }
}
