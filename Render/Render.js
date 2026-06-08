import { getGameWorldSurfaceSettings } from "./WorldSurfaceBootstrap.js";
import { SpriteCache } from "../Libraries/Canvas/SpriteCache.js";
import { WorldSceneRenderer } from "../Libraries/Render/WorldSceneRenderer.js";
import { getRenderPorts } from "../Core/GamePorts.js";
import { buildWorldRenderInput } from "./adapters/WorldRenderAdapter.js";
import { drawWorldScene } from "./worldSceneDraw.js";
export class Renderer {
    /** @param {{ actorCache?: SpriteCache, turretCache?: SpriteCache } | undefined} caches */
    constructor(canvas, ctx, caches) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.caches = caches;
        this.render3D = new WorldSceneRenderer(getGameWorldSurfaceSettings(), getRenderPorts().world3dPropRecipes);
        this.effectPasses = [
            { zIndex: -5, fn: (state, viewport) => drawWorldScene(this.ctx, { state, viewport, worldSceneRenderer: this.render3D, phases: ["ground", "debris"] }) },
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
