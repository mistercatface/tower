import { getGameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { Renderer } from "../../../Render/Render.js";
import { getSurfaceProfileRevision } from "../../../Libraries/WorldSurface/SurfaceProfileRevision.js";
import { invalidateWallAtlasKeyMemos } from "../../../Render/game/wallSurfaceInvalidation.js";
import { drawTopologyLayer } from "../../../Libraries/Render/map/topology/index.js";
import { sandboxController } from "./tilelabSandbox.js";
/** @type {Renderer | null} */
let labRenderer = null;
/** @type {import("../../../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings | null} */
let labRendererSettings = null;
function getLabRenderer(canvas, ctx) {
    const settings = getGameWorldSurfaceSettings();
    if (!labRenderer || labRenderer.canvas !== canvas || labRendererSettings !== settings) {
        labRenderer = new Renderer(canvas, ctx);
        labRendererSettings = settings;
    }
    return labRenderer;
}
let lastBakeKey = "";
function maybeClearBakeCaches(worldState, profileId) {
    const rev = getSurfaceProfileRevision(profileId);
    const key = `${profileId}:${rev}:${worldState.worldSurfaces.worldSurfaceSeed ?? 0}`;
    if (lastBakeKey === key) return;
    lastBakeKey = key;
    invalidateWallAtlasKeyMemos(worldState);
    worldState.worldSurfaces.clearBakeCache();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 */
export function drawTilelabSurfaceFrame(ctx, canvas, worldState, profileId, drawOptions = {}) {
    const { showVignette = false, debugOverlay = null } = drawOptions;
    const viewW = worldState.viewport.width;
    const viewH = worldState.viewport.height;
    const prevProfileOverride = worldState.worldSurfaces.surfaceProfileOverride;
    worldState.worldSurfaces.surfaceProfileOverride = profileId;
    maybeClearBakeCaches(worldState, profileId);
    const viewport = worldState.viewport;
    getLabRenderer(canvas, ctx).renderSimulationScene(worldState, viewport);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
    ctx.save();
    viewport.apply(ctx);
    if (debugOverlay)
        drawTopologyLayer(
            ctx,
            worldState,
            viewport,
            { showNodes: false, showRoomZones: false, showGridBounds: false, showWalls: debugOverlay.showWalls, showPathDebug: debugOverlay.showPathDebug },
            { selectedNodeId: null },
            { overlay: true },
        );
    worldState.worldSurfaces.surfaceProfileOverride = prevProfileOverride;
    sandboxController?.drawOverlay(ctx);
    ctx.restore();
    if (showVignette) {
        const R = viewport.getVisualRadius();
        const cx = viewport.cx;
        const cy = viewport.cy;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.rect(0, 0, viewW, viewH);
        ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
        ctx.fill("evenodd");
        ctx.restore();
    }
}
export function invalidateMapPreviewBakes() {
    lastBakeKey = "";
    labRenderer = null;
    labRendererSettings = null;
}
