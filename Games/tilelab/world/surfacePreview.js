import { getRenderPorts } from "../../../Core/GamePorts.js";
import { getGameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { WorldSceneRenderer } from "../../../Libraries/Render/WorldSceneRenderer.js";
import { buildWorldRenderInput } from "../../../Render/adapters/WorldRenderAdapter.js";
import { drawWorldScene } from "../../../Render/worldSceneDraw.js";
import { getSurfaceProfileRevision } from "../../../Libraries/WorldSurface/SurfaceProfileRevision.js";
import { invalidateWallAtlasKeyMemos } from "../../../Render/game/wallSurfaceInvalidation.js";
import { drawTopologyLayer } from "../../../Libraries/Render/map/topology/index.js";
import { syncLabScreenCanvasBounds } from "../ui/labCanvas.js";
import { getTilelabDragLaunchToy } from "./tilelabSandbox.js";
/** @type {WorldSceneRenderer | null} */
let render3D = null;
/** @type {import("../../../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings | null} */
let render3DSettings = null;
function getLabRender3D() {
    const settings = getGameWorldSurfaceSettings();
    if (!render3D || render3DSettings !== settings) {
        render3D = new WorldSceneRenderer(settings, getRenderPorts().world3dPropRecipes);
        render3DSettings = settings;
    }
    return render3D;
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
    const worldRenderInput = buildWorldRenderInput(worldState, viewport);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
    ctx.save();
    viewport.apply(ctx);
    drawWorldScene(ctx, { state: worldState, viewport, worldSceneRenderer: getLabRender3D(), canvas, worldRenderInput, phases: ["ground", "buildings", "roofs", "bloom"] });
    if (topologySession && topologyOptions) drawTopologyLayer(ctx, worldState, viewport, topologyOptions, topologySession, { overlay: true });
    worldState.surfaceProfileOverride = prevProfileOverride;
    if (showRangeRing) drawWeaponRangeRing(ctx, cameraX, cameraY, weaponRange);
    if (showFocusMarker) drawFocusMarker(ctx, cameraX, cameraY);
    getTilelabDragLaunchToy()?.drawOverlay(ctx);
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
    render3D = null;
    render3DSettings = null;
}
