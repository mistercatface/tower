import { GamePhase, isWorldScene } from "../../../GameState/GamePhase.js";
import { clearFlatWallFaceCache } from "../../../Render/3D/WallFaceTexture.js";
import { Render3D } from "../../../Render/3D/Render3D.js";
import { Viewport } from "../../../Render/Viewport.js";
import { playerBaseStats, combatVisualSettings } from "../../../Config/Config.js";
import { exportOverlayPx } from "../LabSettings.js";
import { withLabAnimationFrame } from "../../../Render/Floor/FloorTilePainter.js";
import { getFloorProceduralProfile, unregisterRuntimeFloorProfile } from "../../../Config/floorProceduralConfig.js";

const render3D = new Render3D();
let lastBakeKey = "";

const MOVE_SPEED_SCALE = 1;

/**
 * Match backing store to the stage box (no CSS stretch). Returns null if not laid out yet.
 * @returns {{ width: number, height: number, changed: boolean } | null}
 */
export function prepareGameCanvas(canvas, stage) {
    if (!canvas || !stage) {
        return null;
    }
    const rect = stage.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    if (width < 32 || height < 32) {
        return null;
    }
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
    const key = `${profileId}:${worldState.floorTileSeed}`;
    if (lastBakeKey === key) {
        return;
    }
    lastBakeKey = key;
    worldState.floorTiles.clear();
    clearFlatWallFaceCache();
}

function drawLabWorldFrame(ctx, canvas, viewW, viewH, worldState, profileId, gameZoom, weaponRange, drawOptions = {}) {
    const {
        showVignette = false,
        showRangeRing = false,
        showPlayerMarker = true,
    } = drawOptions;

    worldState.phase = GamePhase.COMBAT;
    const prevProfileOverride = worldState.floorTextureProfileOverride;
    worldState.floorTextureProfileOverride = profileId;
    maybeClearBakeCaches(worldState, profileId);

    const cameraX = worldState.player.x;
    const cameraY = worldState.player.y;

    const viewport = new Viewport(cameraX, cameraY, gameZoom);
    viewport.cx = viewW / 2;
    viewport.cy = viewH / 2;
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

    if (isWorldScene(worldState.phase)) {
        worldState.floorTiles.draw(ctx, worldState, viewport);
    }

    render3D.draw3DBuildings(ctx, worldState, viewport);

    if (combatVisualSettings.bloom?.enabled) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "screen";
        ctx.filter = `blur(${combatVisualSettings.bloom.blur}px)`;
        ctx.drawImage(canvas, 0, 0);
        ctx.restore();
    }

    worldState.canvasBounds = prevCanvasBounds;
    worldState.floorTextureProfileOverride = prevProfileOverride;

    if (showRangeRing) {
        drawWeaponRangeRing(ctx, worldState.player.x, worldState.player.y, weaponRange);
    }

    if (showPlayerMarker) {
        drawPlayerMarker(ctx, worldState.player.x, worldState.player.y);
    }

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

    if (!worldState || !profileId || !viewWidth || !viewHeight) {
        return { zoom: gameZoom };
    }

    const ctx = canvas.getContext("2d");
    const result = drawLabWorldFrame(
        ctx,
        canvas,
        viewWidth,
        viewHeight,
        worldState,
        profileId,
        gameZoom,
        weaponRange,
        {
            showVignette,
            showRangeRing,
            showPlayerMarker: true,
        }
    );
    return result;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRecorderMimeType() {
    const candidates = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
    ];
    for (const mimeType of candidates) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
            return mimeType;
        }
    }
    return "";
}

/** Render one export frame to an offscreen canvas (circular overlay, no HUD). */
function renderExportOverlayFrame(world, frameProfileId, ctrl, sizePx) {
    const canvas = new OffscreenCanvas(sizePx, sizePx);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    drawLabWorldFrame(
        ctx,
        canvas,
        sizePx,
        sizePx,
        world,
        frameProfileId,
        ctrl.gameZoom,
        ctrl.weaponRange,
        {
            showVignette: true,
            showRangeRing: false,
            showPlayerMarker: false,
        }
    );
    return canvas;
}

/** Copy offscreen canvas → document canvas for MediaRecorder. */
function blitFrame(targetCtx, sizePx, source) {
    targetCtx.clearRect(0, 0, sizePx, sizePx);
    targetCtx.drawImage(source, 0, 0);
}

async function encodeCanvasesToWebm(frameCanvases, sizePx, msPerFrame) {
    const mimeType = pickRecorderMimeType();
    if (!mimeType) {
        return null;
    }

    const encodeCanvas = document.createElement("canvas");
    encodeCanvas.width = sizePx;
    encodeCanvas.height = sizePx;
    const encodeCtx = encodeCanvas.getContext("2d");
    encodeCtx.imageSmoothingEnabled = false;

    const stream = encodeCanvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
    });

    const chunks = [];
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
            chunks.push(e.data);
        }
    };
    const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
    });

    recorder.start(100);

    for (let i = 0; i < frameCanvases.length; i++) {
        blitFrame(encodeCtx, sizePx, frameCanvases[i]);
        if (typeof track.requestFrame === "function") {
            track.requestFrame();
        }
        await sleep(Math.max(16, msPerFrame));
    }

    await sleep(100);
    recorder.stop();
    await stopped;

    const blob = new Blob(chunks, { type: "video/webm" });
    return blob.size >= 1024 ? blob : null;
}

/**
 * Bake each animation frame to an offscreen canvas, then mux to WebM.
 * Does not touch the on-screen map preview.
 */
export async function exportMapOverlayWebm(ctrl, world, profileId, { onProgress } = {}) {
    const profile = getFloorProceduralProfile(profileId);
    if (!profile?.animation || !world || !ctrl) {
        return { ok: false };
    }

    const sizePx = exportOverlayPx;
    const frameCount = Math.max(2, profile.animation.frames ?? 2);
    const durationMs = profile.animation.durationMs ?? 1000;
    const msPerFrame = durationMs / frameCount;
    const exportProfileId = `${profileId}_export`;

    const frameCanvases = [];
    for (let i = 0; i < frameCount; i++) {
        onProgress?.(i + 1, frameCount, "render");
        world.floorTiles.clear();

        withLabAnimationFrame(profileId, i, (frameProfileId) => {
            frameCanvases.push(renderExportOverlayFrame(world, frameProfileId, ctrl, sizePx));
        }, { staticBake: true, stableId: true });

        if (i % 3 === 2) {
            await sleep(0);
        }
    }

    unregisterRuntimeFloorProfile(exportProfileId);

    onProgress?.(frameCount, frameCount, "encode");
    const blob = await encodeCanvasesToWebm(frameCanvases, sizePx, msPerFrame);
    if (!blob) {
        return { ok: false };
    }

    return {
        ok: true,
        blob,
        filename: `map-overlay-${profileId}-seed${world.floorTileSeed ?? 0}.webm`,
    };
}

/** Invalidate baked floor/wall caches after profile or floor seed change. */
export function invalidateMapPreviewBakes() {
    lastBakeKey = "";
}

/**
 * WASD / arrows move player; drag moves player; wheel zoom. Camera follows player.
 * @param {() => { worldState?: object, gameZoom?: number }} getOptions
 */
export function initMapPreviewNavigation(getOptions) {
    const canvases = () => [document.getElementById("gamePreview")].filter(Boolean);

    const moveKeys = new Set();
    let moveRaf = null;

    const moveSpeed = () => (playerBaseStats.speed * MOVE_SPEED_SCALE) / (getOptions().gameZoom || 1);

    const applyPlayerDelta = (dx, dy) => {
        const world = getOptions().worldState;
        if (!world?.player) {
            return;
        }
        const len = Math.hypot(dx, dy) || 1;
        const step = moveSpeed() * 0.016;
        world.player.x += (dx / len) * step;
        world.player.y += (dy / len) * step;
    };

    const tickMove = () => {
        let dx = 0;
        let dy = 0;
        if (moveKeys.has("KeyW") || moveKeys.has("ArrowUp")) {
            dy -= 1;
        }
        if (moveKeys.has("KeyS") || moveKeys.has("ArrowDown")) {
            dy += 1;
        }
        if (moveKeys.has("KeyA") || moveKeys.has("ArrowLeft")) {
            dx -= 1;
        }
        if (moveKeys.has("KeyD") || moveKeys.has("ArrowRight")) {
            dx += 1;
        }
        if (dx !== 0 || dy !== 0) {
            applyPlayerDelta(dx, dy);
        }
        moveRaf = requestAnimationFrame(tickMove);
    };

    window.addEventListener("keydown", (e) => {
        if (e.target.matches("input, textarea, select")) {
            return;
        }
        if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
            moveKeys.add(e.code);
            e.preventDefault();
            if (!moveRaf) {
                moveRaf = requestAnimationFrame(tickMove);
            }
        }
    });

    window.addEventListener("keyup", (e) => {
        moveKeys.delete(e.code);
        if (moveKeys.size === 0 && moveRaf) {
            cancelAnimationFrame(moveRaf);
            moveRaf = null;
        }
    });

    for (const canvas of canvases()) {
        canvas.addEventListener("wheel", (e) => {
            e.preventDefault();
            const opts = getOptions();
            const el = document.getElementById("gameZoomInput");
            const next = Math.min(2.5, Math.max(0.25, (opts.gameZoom || 1) + (e.deltaY > 0 ? -0.05 : 0.05)));
            if (el) {
                el.value = String(next);
                document.getElementById("gameZoomValue").textContent = el.value;
            }
        }, { passive: false });

        canvas.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) {
                return;
            }
            const world = getOptions().worldState;
            if (!world?.player) {
                return;
            }
            dragState = {
                canvas,
                startX: e.clientX,
                startY: e.clientY,
                playerX: world.player.x,
                playerY: world.player.y,
                zoom: getOptions().gameZoom || 1,
            };
            canvas.setPointerCapture(e.pointerId);
        });

        canvas.addEventListener("pointermove", (e) => {
            if (!dragState || dragState.canvas !== canvas) {
                return;
            }
            const world = getOptions().worldState;
            if (!world?.player) {
                return;
            }
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            world.player.x = dragState.playerX - dx / dragState.zoom;
            world.player.y = dragState.playerY - dy / dragState.zoom;
        });

        const endDrag = () => {
            if (dragState?.canvas === canvas) {
                dragState = null;
            }
        };
        canvas.addEventListener("pointerup", endDrag);
        canvas.addEventListener("pointercancel", endDrag);
    }
}
