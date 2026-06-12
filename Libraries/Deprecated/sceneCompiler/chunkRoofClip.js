import { clipToPath } from "../../Canvas/CanvasPath.js";
import { worldToChunkCol, worldToChunkRow } from "../../Spatial/grid/ChunkGrid.js";
import { getDamageAlphaFromHealth, drawDamageOverlayInClip } from "../../Render/Structure3D/wallDamageVisual.js";
import { RenderableRoofCap } from "./Renderables.js";
import { RenderScene } from "./RenderScene.js";
/**
 * @typedef {Object} SceneCompilerChunkPass
 * @property {number} originX
 * @property {number} originY
 * @property {number} sizePx
 * @property {number} zLevel
 * @property {RenderScene | null} renderScene
 * @property {import("../../Spatial/iso/ElevationCamera.js").ElevationCamera} camera
 * @property {RenderableRoofCap[] | null} [chunkRoofs]
 */
/** @param {SceneCompilerChunkPass} pass */
function getChunkRoofs(pass) {
    if (pass.chunkRoofs) return pass.chunkRoofs;
    const { renderScene, originX, originY, sizePx } = pass;
    if (!renderScene) return (pass.chunkRoofs = []);
    const minCol = worldToChunkCol(originX, renderScene.gridMinX, renderScene.chunkSizePx);
    const maxCol = worldToChunkCol(originX + sizePx - 1, renderScene.gridMinX, renderScene.chunkSizePx);
    const minRow = worldToChunkRow(originY, renderScene.gridMinY, renderScene.chunkSizePx);
    const maxRow = worldToChunkRow(originY + sizePx - 1, renderScene.gridMinY, renderScene.chunkSizePx);
    pass.chunkRoofs = renderScene.collectPass("roofs", minCol, minRow, maxCol, maxRow);
    return pass.chunkRoofs;
}
/** @param {CanvasRenderingContext2D} ctx @param {SceneCompilerChunkPass} pass @returns {boolean} */
export function clipChunkToRoofFootprints(ctx, pass) {
    const { zLevel, camera } = pass;
    const roofs = getChunkRoofs(pass);
    if (!roofs.length) return false;
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        for (let i = 0; i < roofs.length; i++) {
            const roof = roofs[i];
            if (roof.simWall?.isDead) continue;
            if (Math.abs(roof.zLevel - zLevel) > 0.01) continue;
            roof.draw(clipCtx, camera);
            clippedAny = true;
        }
        return clippedAny;
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {SceneCompilerChunkPass} pass */
export function drawRoofSegmentDamageOverlays(ctx, pass) {
    const { zLevel, camera } = pass;
    const roofs = getChunkRoofs(pass);
    for (let i = 0; i < roofs.length; i++) {
        const roof = roofs[i];
        if (roof.simWall?.isDead) continue;
        if (Math.abs(roof.zLevel - zLevel) > 0.01) continue;
        const damageAlpha = getDamageAlphaFromHealth(roof.simWall.health, roof.simWall.maxHealth);
        if (damageAlpha <= 0) continue;
        drawDamageOverlayInClip(ctx, damageAlpha, (clipCtx) => {
            roof.draw(clipCtx, camera);
        });
    }
}
/**
 * Former `WorldSurfaceEngine.drawRoofLayers` — iterated `roofZLevels` into `drawGroundChunks`.
 * Superseded by `WorldSurfaceSystem.drawRoofs` with `staticRoofDraw: true`.
 *
 * @param {import("../../WorldSurface/WorldSurfaceEngine.js").WorldSurfaceEngine} engine
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} baseOptions
 */
export function drawRoofLayers(engine, ctx, baseOptions) {
    const levels = baseOptions.roofZLevels ?? engine.settings.roofZLevels ?? [];
    for (let i = 0; i < levels.length; i++) {
        const z = levels[i];
        if (z <= 0) continue;
        const roofSpatialIndex = baseOptions.roofSpatialIndices?.get(z) ?? baseOptions.wallSpatialIndex;
        engine.drawGroundChunks(ctx, { ...baseOptions, wallSpatialIndex: roofSpatialIndex, zLevel: z, beforeDraw: undefined });
    }
}
