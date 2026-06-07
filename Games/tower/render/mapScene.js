import { renderMapView } from "../../../Libraries/Render/map/MapViewRenderer.js";
import { createGameMapViewConfig } from "../../../Libraries/Render/map/mapViewPresets.js";
import { drawTowerActorAndTurrets } from "./combatRenderPasses.js";
/** @param {import("../../../Render/Render.js").Renderer} renderer */
export function renderTowerMapScene(renderer, state, viewport) {
    const ctx = renderer.ctx;
    ctx.save();
    ctx.clearRect(0, 0, renderer.canvas.width, renderer.canvas.height);
    renderMapView(ctx, state, { ...createGameMapViewConfig(), viewport, clearBackground: false, wallCache: state.mapWallCache });
    const oldX = state.player.x;
    const oldY = state.player.y;
    const { x: mapX, y: mapY } = state.getMapPlayerGraphCoords();
    state.player.x = mapX;
    state.player.y = mapY;
    drawTowerActorAndTurrets(renderer, state.player, state, null);
    state.player.x = oldX;
    state.player.y = oldY;
    renderer.renderEntityCollection(state.floatingTexts, state);
    ctx.restore();
}
