import { getGameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { WorldSceneRenderer } from "../../../Libraries/Render/WorldSceneRenderer.js";
import { drawWorldScene } from "../../../Render/worldSceneDraw.js";
import { getSurfaceProfileRevision } from "../../../Libraries/WorldSurface/SurfaceProfileRevision.js";
import { invalidateWallAtlasKeyMemos } from "../../../Render/game/wallSurfaceInvalidation.js";
import { setupLabViewportNavigation } from "../../../Tools/Lab/lab-shared.js";
import { clampLabZoom, syncZoomSliderFromViewport } from "../ui/zoomSlider.js";
import { drawMapLabInWorld } from "./drawMapLabInWorld.js";
/** @type {WorldSceneRenderer | null} */
let render3D = null;
/** @type {import("../../../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings | null} */
let render3DSettings = null;
function getLabRender3D() {
    const settings = getGameWorldSurfaceSettings();
    if (!render3D || render3DSettings !== settings) {
        render3D = new WorldSceneRenderer(settings);
        render3DSettings = settings;
    }
    return render3D;
}
let lastBakeKey = "";
export function prepareGameCanvas(canvas, stage) {
    if (!canvas || !stage) return null;
    const rect = stage.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    if (width < 32 || height < 32) return null;
    let changed = false;
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        changed = true;
    }
    return { width, height, changed };
}
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
    const { showVignette = false, showRangeRing = false, showFocusMarker = true, viewW, viewH, mapLab = null, topologyOptions = null } = drawOptions;
    worldState.phase = "simulation";
    const prevProfileOverride = worldState.surfaceProfileOverride;
    worldState.surfaceProfileOverride = profileId;
    maybeClearBakeCaches(worldState, profileId);
    const viewport = worldState.mapViewport;
    viewport.setCanvasSize(viewW, viewH);
    const cameraX = viewport.x;
    const cameraY = viewport.y;
    const prevCanvasBounds = worldState.canvasBounds;
    worldState.canvasBounds = { width: viewW, height: viewH };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
    ctx.save();
    viewport.apply(ctx);
    drawWorldScene(ctx, { state: worldState, viewport, worldSceneRenderer: getLabRender3D(), canvas });
    if (mapLab && topologyOptions) drawMapLabInWorld(ctx, worldState, viewport, topologyOptions, mapLab);
    worldState.canvasBounds = prevCanvasBounds;
    worldState.surfaceProfileOverride = prevProfileOverride;
    if (showRangeRing) drawWeaponRangeRing(ctx, cameraX, cameraY, weaponRange);
    if (showFocusMarker) drawFocusMarker(ctx, cameraX, cameraY);
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
export function initMapPreviewNavigation(getOptions, handlers = {}) {
    setupLabViewportNavigation("gameCanvas", {
        getCamera: () => {
            const vp = getOptions().worldState?.mapViewport;
            return vp ? { x: vp.x, y: vp.y, zoom: vp.zoom || 1 } : { x: 0, y: 0, zoom: 1 };
        },
        setCamera: (x, y, zoom) => {
            const world = getOptions().worldState;
            if (world?.mapViewport) {
                world.mapViewport.snapTo(x, y);
                world.mapViewport.zoom = clampLabZoom(zoom);
                syncZoomSliderFromViewport(world);
            }
        },
        onUpdate: handlers.onViewChange,
    });
}
