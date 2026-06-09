import { getGameWorldSurfaceSettings } from "./WorldSurfaceBootstrap.js";
import { SpriteCache } from "../Libraries/Canvas/SpriteCache.js";
import { WorldSceneRenderer } from "../Libraries/Render/WorldSceneRenderer.js";
import { getRenderPorts } from "../Core/GamePorts.js";
import { buildWorldRenderInput } from "./adapters/WorldRenderAdapter.js";
import { LIBRARY_WORLD_SURFACE_DEFAULTS } from "../Libraries/WorldSurface/worldSurfaceDefaults.js";
import { drawWorldSceneBackdrop, drawWorldSceneBloom, drawWorldSceneStructure } from "./worldSceneDraw.js";
export class Renderer {
    /** @param {{ actorCache?: SpriteCache, turretCache?: SpriteCache } | undefined} caches */
    constructor(canvas, ctx, caches) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.caches = caches;
        this.render3D = new WorldSceneRenderer(getGameWorldSurfaceSettings(), getRenderPorts().world3dPropRecipes);
        this.effectPasses = [
            {
                zIndex: -5,
                fn: (state, viewport) => drawWorldSceneBackdrop(this.ctx, { state, viewport, worldSceneRenderer: this.render3D, worldRenderInput: this.getWorldRenderInput(state, viewport) }),
            },
            { zIndex: 55, fn: (state, viewport) => this.render3D.drawRagdollCorpsesOnly(this.ctx, this.getWorldRenderInput(state, viewport), viewport) },
            {
                zIndex: 70,
                fn: (state, viewport) => drawWorldSceneStructure(this.ctx, { state, viewport, worldSceneRenderer: this.render3D, worldRenderInput: this.getWorldRenderInput(state, viewport) }),
            },
        ];
        if (LIBRARY_WORLD_SURFACE_DEFAULTS.bloom.enabled) this.effectPasses.push({ zIndex: 71, fn: () => drawWorldSceneBloom(this.ctx, this.canvas) });
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
        const surfaceSettings = getGameWorldSurfaceSettings();
        viewport.beginFrame({ width: state.canvasBounds.width, height: state.canvasBounds.height, viewQueryPadPx: surfaceSettings.viewQueryPadPx, viewPaddingPx: surfaceSettings.viewPaddingPx });
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        viewport.apply(this.ctx);
        if (!this._simulationPipeline || this._pipelineEntityLayers !== state.entityLayers) {
            this.buildSimulationPipeline(state, viewport);
            this._pipelineEntityLayers = state.entityLayers;
        }
        for (let i = 0; i < this._simulationPipeline.length; i++) this._simulationPipeline[i](state, viewport);
        this.ctx.restore();
        getRenderPorts().drawPostSimulation?.(state, viewport, this.ctx, this);
    }
    renderEntityCollection(collection, state, viewport) {
        if (!collection) return;
        for (const entity of collection) {
            if (viewport && typeof entity.isVisible === "function" && !entity.isVisible(viewport)) continue;
            entity.render(this.ctx, this, state);
        }
    }
}
