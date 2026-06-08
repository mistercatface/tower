import { getRenderPorts } from "../../../Core/GamePorts.js";
import { getGameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { Renderer } from "../../../Render/Render.js";
import { getSurfaceProfileRevision } from "../../../Libraries/WorldSurface/SurfaceProfileRevision.js";
import { invalidateWallAtlasKeyMemos } from "../../../Render/game/wallSurfaceInvalidation.js";
import { drawTopologyLayer } from "../../../Libraries/Render/map/topology/index.js";
import { syncLabScreenCanvasBounds } from "../ui/labCanvas.js";
import { getTilelabSandboxController } from "./tilelabSandbox.js";
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
function drawWeaponRangeRing(ctx, x, y, range) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, range, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 188, 212, 0.35)";
    ctx.lineWidth = 1 / Math.max(0.001, ctx.getTransform().a);
    ctx.stroke();
    ctx.restore();
}
function drawFocusMarker(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = "#00bcd4";
    ctx.strokeStyle = "#003840";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}
function maybeClearBakeCaches(worldState, profileId) {
    const rev = getSurfaceProfileRevision(profileId);
    const key = `${profileId}:${rev}:${worldState.worldSurfaceSeed ?? 0}`;
    if (lastBakeKey === key) return;
    lastBakeKey = key;
    invalidateWallAtlasKeyMemos(worldState);
    worldState.worldSurfaces.clear();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 */
export function drawTilelabSurfaceFrame(ctx, canvas, worldState, profileId, weaponRange, drawOptions = {}) {
    const { showVignette = false, showRangeRing = false, showFocusMarker = true, topologySession = null, topologyOptions = null } = drawOptions;
    const size = syncLabScreenCanvasBounds(worldState);
    if (!size) return;
    const viewW = size.width;
    const viewH = size.height;
    worldState.phase = "simulation";
    const prevProfileOverride = worldState.surfaceProfileOverride;
    worldState.surfaceProfileOverride = profileId;
    maybeClearBakeCaches(worldState, profileId);
    const viewport = worldState.mapViewport;
    const cameraX = viewport.x;
    const cameraY = viewport.y;
    getLabRenderer(canvas, ctx).renderSimulationScene(worldState, viewport);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
    ctx.save();
    viewport.apply(ctx);
    if (topologySession && topologyOptions) drawTopologyLayer(ctx, worldState, viewport, topologyOptions, topologySession, { overlay: true });
    worldState.surfaceProfileOverride = prevProfileOverride;
    if (showRangeRing) drawWeaponRangeRing(ctx, cameraX, cameraY, weaponRange);
    if (showFocusMarker) drawFocusMarker(ctx, cameraX, cameraY);
    getTilelabSandboxController()?.drawOverlay(ctx);
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
