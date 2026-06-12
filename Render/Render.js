import { engine } from "../Apps/Editor/engine.js";
import { getGameWorldSurfaceSettings } from "./WorldSurfaceBootstrap.js";
import { SpriteCache } from "../Libraries/Canvas/SpriteCache.js";
import { WorldSceneRenderer } from "../Libraries/Render/WorldSceneRenderer.js";
import { resolveSurfaceProfileAtCoords } from "./game/surfaceProfileResolver.js";
import { LIBRARY_WORLD_SURFACE_DEFAULTS } from "../Libraries/WorldSurface/worldSurfaceDefaults.js";
import { createStructureDrawPass } from "./StructureDrawPass.js";
import { normalizeWorldRenderMode, WORLD_RENDER_MODE_DEFAULT } from "./WorldRenderMode.js";
import { combatSpatial } from "../Systems/World/CombatSpatialFrame.js";
export class Renderer {
    /** @param {{ actorCache?: SpriteCache, turretCache?: SpriteCache } | undefined} caches */
    constructor(canvas, ctx, caches) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.caches = caches;
        this.render3D = new WorldSceneRenderer(getGameWorldSurfaceSettings(), engine.render.world3dPropRecipes);
        this.worldSceneDrawInput = {
            ragdollCorpses: [],
            worldSurfaces: null,
            proceduralSurfaceDraw: {
                surfaceSeed: 0,
                surfaceProfileOverride: null,
                obstacleCellSize: 0,
                boundGameState: null,
                resolveProfileAt(x, y) {
                    return resolveSurfaceProfileAtCoords(this.boundGameState, x, y);
                },
            },
        };
        const surfaceSettings = getGameWorldSurfaceSettings();
        this.surfaceDrawPadQuery = surfaceSettings.viewQueryPadPx;
        this.surfaceDrawPadDraw = surfaceSettings.viewPaddingPx;
        this.structureDrawPass = createStructureDrawPass(WORLD_RENDER_MODE_DEFAULT, this);
        this._worldRenderMode = WORLD_RENDER_MODE_DEFAULT;
        this.effectPasses = [
            { zIndex: -5, fn: (state, viewport) => this.drawWorldSceneBackdrop(state, viewport) },
            { zIndex: 55, fn: (state, viewport) => this.drawRagdollCorpses(state, viewport) },
            { zIndex: 70, fn: (state, viewport) => this.drawWorldSceneStructure(state, viewport) },
        ];
        if (LIBRARY_WORLD_SURFACE_DEFAULTS.bloom.enabled) this.effectPasses.push({ zIndex: 71, fn: () => this.drawWorldSceneBloom() });
    }
    /** @param {import("../GameState/GameState.js").GameState} state */
    syncWorldSceneDrawInput(state) {
        combatSpatial.begin(state);
        const input = this.worldSceneDrawInput;
        input.entityRegistry = state.entityRegistry;
        input.spatialFrame = combatSpatial;
        input.ragdollCorpses = state.ragdollCorpses ?? [];
        input.worldSurfaces = state.worldSurfaces;
        input.obstacleGrid = state.obstacleGrid;
        input.gameState = state;
        const surfaceDraw = input.proceduralSurfaceDraw;
        surfaceDraw.boundGameState = state;
        surfaceDraw.surfaceSeed = state.worldSurfaces.worldSurfaceSeed ?? 0;
        surfaceDraw.surfaceProfileOverride = state.worldSurfaces.surfaceProfileOverride ?? null;
        surfaceDraw.obstacleCellSize = state.obstacleGrid.cellSize;
    }
    /** Ground tiles and debris props — zIndex -5. */
    drawWorldSceneBackdrop(state, viewport) {
        state.worldSurfaces.drawGround(this.ctx, state, viewport);
        engine.render.drawGroundOverlays(state, viewport, this.ctx);
        this.render3D.drawDebrisProps(this.ctx, this.worldSceneDrawInput, viewport);
    }
    /** Ragdoll corpses between entities and structure — zIndex 55. */
    drawRagdollCorpses(state, viewport) {
        this.render3D.drawRagdollCorpsesOnly(this.ctx, this.worldSceneDrawInput, viewport);
    }
    /** Walls and roofs — zIndex 70. */
    drawWorldSceneStructure(state, viewport) {
        this.structureDrawPass.draw(this.ctx, state, viewport);
    }
    /** @param {import("./WorldRenderMode.js").WorldRenderMode} mode */
    applyWorldRenderMode(mode) {
        const normalized = normalizeWorldRenderMode(mode);
        if (this._worldRenderMode === normalized) return;
        this._worldRenderMode = normalized;
        this.structureDrawPass = createStructureDrawPass(normalized, this);
    }
    /** Full-canvas bloom — zIndex 71 when enabled. */
    drawWorldSceneBloom() {
        const { blur } = LIBRARY_WORLD_SURFACE_DEFAULTS.bloom;
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.globalCompositeOperation = "screen";
        this.ctx.filter = `blur(${blur}px)`;
        this.ctx.drawImage(this.canvas, 0, 0);
        this.ctx.restore();
    }
    buildSimulationPipeline(state, viewport) {
        const entityPasses = (state.entityLayers ?? []).map((layer) => ({ zIndex: layer.zIndex, fn: (state, viewport) => this.renderEntityCollection(state[layer.key], state, viewport) }));
        const enabledEffects = this.effectPasses;
        const portPasses = engine.render.simulationEffectPasses.map((pass) => ({ zIndex: pass.zIndex, fn: (state, viewport) => pass.draw(state, viewport, this.ctx, this) }));
        const pipeline = [...enabledEffects, ...portPasses, ...entityPasses];
        pipeline.sort((a, b) => a.zIndex - b.zIndex);
        this.simulationPipeline = pipeline.map((p) => p.fn);
    }
    renderSimulationScene(state, viewport) {
        this.syncWorldSceneDrawInput(state);
        viewport.configureDrawBounds(this.surfaceDrawPadQuery, this.surfaceDrawPadDraw);
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        viewport.apply(this.ctx);
        if (!this.simulationPipeline || this.pipelineEntityLayers !== state.entityLayers) {
            this.buildSimulationPipeline(state, viewport);
            this.pipelineEntityLayers = state.entityLayers;
        }
        for (let i = 0; i < this.simulationPipeline.length; i++) this.simulationPipeline[i](state, viewport);
        this.ctx.restore();
        engine.render.drawPostSimulation(state, viewport, this.ctx, this);
    }
    renderEntityCollection(collection, state, viewport) {
        if (!collection) return;
        for (const entity of collection) {
            if (typeof entity.isVisible === "function" && !entity.isVisible(viewport)) continue;
            entity.render(this.ctx, this, state);
        }
    }
}
