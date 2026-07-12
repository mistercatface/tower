import { gameWorldSurfaceSettings } from "./WorldSurfaceBootstrap.js";
import { WorldSceneRenderer } from "../Libraries/Render/render.js";
import { WORLD_SURFACE_DEFAULTS } from "../Config/world.js";
import { WORLD_RENDER_MODE_FLAT2D, WORLD_RENDER_MODE_RADIAL_SPHERES, WORLD_RENDER_MODE_COUNT } from "../Core/engineEnums.js";
import { circleInViewBounds, VIEW_TIER_PROPS } from "../Core/engineMemory.js";
/**
 * @typedef {object} SimulationSceneHooks
 * @property {(state: object, viewport: object, ctx: CanvasRenderingContext2D) => void} [drawGroundOverlays]
 * @property {import("../Core/GameDefinitionTypes.js").SimulationEffectPass[]} [simulationEffectPasses]
 * @property {(state: object, viewport: object, ctx: CanvasRenderingContext2D, renderer: Renderer) => void} [drawPostSimulation]
 */
/**
 * @typedef {object} RendererOptions
 * @property {SimulationSceneHooks} [sceneHooks]
 */
export class Renderer {
    /** @param {RendererOptions | undefined} options */
    constructor(canvas, ctx, options = {}) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.sceneHooks = options.sceneHooks ?? {};
        this.render3D = new WorldSceneRenderer();
        this._worldRenderMode = WORLD_RENDER_MODE_FLAT2D;
        this.effectPasses = [
            { zIndex: -5, fn: (state, viewport) => this.drawWorldSceneBackdrop(state, viewport) },
            { zIndex: 70, fn: (state, viewport) => this.drawWorldSceneStructure(state, viewport) },
            { zIndex: 71, fn: (state) => this.drawWorldSceneBloom(state) },
        ];
    }
    /** Ground tiles — zIndex -5. */
    drawWorldSceneBackdrop(state, viewport) {
        state.worldSurfaces.drawGround(this.ctx, state, viewport);
        this.sceneHooks.drawGroundOverlays?.(state, viewport, this.ctx);
    }
    /** Walls and roofs — zIndex 70. */
    drawWorldSceneStructure(state, viewport) {
        if (this._worldRenderMode === WORLD_RENDER_MODE_FLAT2D || this._worldRenderMode === WORLD_RENDER_MODE_RADIAL_SPHERES) {
            state.worldSurfaces.drawFlatWallRails(this.ctx, state, viewport);
            this.render3D.draw3DBuildings(this.ctx, state, viewport, { skipWalls: true, flatProps: true, radialSpheres: this._worldRenderMode === WORLD_RENDER_MODE_RADIAL_SPHERES });
            return;
        }
        this.render3D.draw3DBuildings(this.ctx, state, viewport);
        state.worldSurfaces.drawRoofs(this.ctx, state, viewport);
    }
    applyWorldRenderMode(mode) {
        const m = mode | 0;
        this._worldRenderMode = m === mode && m >= 0 && m < WORLD_RENDER_MODE_COUNT ? m : WORLD_RENDER_MODE_FLAT2D;
    }
    /** Full-canvas bloom — zIndex 71; gated by state.worldBloomEnabled at draw time. */
    drawWorldSceneBloom(state) {
        if (!state.worldBloomEnabled) return;
        const { blur } = WORLD_SURFACE_DEFAULTS.bloom;
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
        const portPasses = (this.sceneHooks.simulationEffectPasses ?? []).map((pass) => ({ zIndex: pass.zIndex, fn: (state, viewport) => pass.draw(state, viewport, this.ctx, this) }));
        const pipeline = [...enabledEffects, ...portPasses, ...entityPasses];
        pipeline.sort((a, b) => a.zIndex - b.zIndex);
        this.simulationPipeline = pipeline.map((p) => p.fn);
    }
    renderSimulationScene(state, viewport) {
        const surfaceSettings = gameWorldSurfaceSettings;
        viewport.configureDrawBounds(surfaceSettings.viewQueryPadPx, surfaceSettings.viewPaddingPx);
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        viewport.apply(this.ctx);
        if (!this.simulationPipeline || this.pipelineEntityLayers !== state.entityLayers) {
            this.buildSimulationPipeline(state, viewport);
            this.pipelineEntityLayers = state.entityLayers;
        }
        for (let i = 0; i < this.simulationPipeline.length; i++) this.simulationPipeline[i](state, viewport);
        this.ctx.restore();
        this.sceneHooks.drawPostSimulation?.(state, viewport, this.ctx, this);
    }
    renderEntityCollection(collection, state, viewport) {
        if (!collection) return;
        for (let i = 0; i < collection.length; i++) {
            const entity = collection[i];
            if (!circleInViewBounds(entity.x, entity.y, entity.radius, VIEW_TIER_PROPS)) continue;
            entity.render(this.ctx, this, state);
        }
    }
}
