import { getGameWorldSurfaceSettings } from "../../../Render/WorldSurfaceBootstrap.js";
import { WorldSceneRenderer } from "../../../Libraries/Render/WorldSceneRenderer.js";
import { drawWorldScene } from "../../../Render/worldSceneDraw.js";
import { Viewport } from "../../../Libraries/Viewport/Viewport.js";
import { playerBaseStats } from "../../../Games/tower/config/towerConfig.js";
import { getSurfaceProfileRevision } from "../../../Libraries/WorldSurface/SurfaceProfileRevision.js";
import { invalidateWallAtlasKeyMemos } from "../../../Render/game/wallSurfaceInvalidation.js";
import { setupLabViewportNavigation } from "../../Lab/lab-shared.js";
import { getLabFocus, setLabFocus } from "./LabMapWorld.js";
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
const MOVE_SPEED_SCALE = 1;
/**
 * Match backing store to the stage box (no CSS stretch). Returns null if not laid out yet.
 * @returns {{ width: number, height: number, changed: boolean } | null}
 */
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
let dragState = null;
function drawWeaponRangeRing(ctx, x, y, range) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, range, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 188, 212, 0.35)";
    ctx.lineWidth = 1 / Math.max(0.001, ctx.getTransform().a);
    ctx.stroke();
    ctx.restore();
}
function drawPlayerMarker(ctx, x, y) {
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
function drawLabWorldFrame(ctx, canvas, viewW, viewH, worldState, profileId, gameZoom, weaponRange, drawOptions = {}) {
    const { showVignette = false, showRangeRing = false, showPlayerMarker = true } = drawOptions;
    worldState.phase = "simulation";
    const prevProfileOverride = worldState.surfaceProfileOverride;
    worldState.surfaceProfileOverride = profileId;
    maybeClearBakeCaches(worldState, profileId);
    const { x: cameraX, y: cameraY } = getLabFocus(worldState);
    const viewport = new Viewport(cameraX, cameraY, gameZoom);
    viewport.setCanvasSize(viewW, viewH);
    viewport.zoom = gameZoom;
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
    worldState.canvasBounds = prevCanvasBounds;
    worldState.surfaceProfileOverride = prevProfileOverride;
    if (showRangeRing) drawWeaponRangeRing(ctx, cameraX, cameraY, weaponRange);
    if (showPlayerMarker) drawPlayerMarker(ctx, cameraX, cameraY);
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
    return { zoom: gameZoom, cameraX, cameraY, visualRadius: viewport.getVisualRadius() };
}
/**
 * Full generated map preview — camera locked to player (combat-style).
 * @param {HTMLCanvasElement} canvas
 * @param {{ worldState: object, profileId: string, gameZoom: number, showRangeRing: boolean, weaponRange: number, viewWidth: number, viewHeight: number, showVignette?: boolean }} options
 */
export function renderGamePreview(canvas, options) {
    const { worldState, profileId, gameZoom, showRangeRing, weaponRange, viewWidth, viewHeight, showVignette = false } = options;
    if (!worldState || !profileId || !viewWidth || !viewHeight) return { zoom: gameZoom };
    const ctx = canvas.getContext("2d");
    const result = drawLabWorldFrame(ctx, canvas, viewWidth, viewHeight, worldState, profileId, gameZoom, weaponRange, { showVignette, showRangeRing, showPlayerMarker: true });
    return result;
}
/** Invalidate baked floor/wall caches after profile or floor seed change. */
export function invalidateMapPreviewBakes() {
    lastBakeKey = "";
    render3D = null;
    render3DSettings = null;
}
export function initMapPreviewNavigation(getOptions, handlers = {}) {
    setupLabViewportNavigation("gamePreview", {
        getCamera: () => {
            const world = getOptions().worldState;
            const focus = world ? getLabFocus(world) : { x: 0, y: 0 };
            return { x: focus.x, y: focus.y, zoom: getOptions().gameZoom ?? 1 };
        },
        setCamera: (x, y, zoom) => {
            const world = getOptions().worldState;
            if (world) setLabFocus(world, x, y);
            const zoomInput = document.getElementById("gameZoomInput");
            if (zoomInput) {
                zoomInput.value = String(zoom);
                const valEl = document.getElementById("gameZoomValue");
                if (valEl) valEl.textContent = zoomInput.value;
            }
        },
        onUpdate: handlers.onViewChange,
    });
}
