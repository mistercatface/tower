import { GamePhase, isWorldScene } from "../../../GameState/GamePhase.js";
import { clearFlatWallFaceCache } from "../../../Render/3D/WallFaceTexture.js";
import { Render3D } from "../../../Render/3D/Render3D.js";
import { Viewport } from "../../../Render/Viewport.js";
import { playerBaseStats } from "../../../Config/Config.js";
import { applyLabProfileOverride } from "./LabMapWorld.js";

const render3D = new Render3D();
let lastBakeKey = "";
let isNavigating = false;
let navRenderPending = false;
let lastQualityRenderAt = 0;

const NAV_RENDER_INTERVAL_MS = 32;
const MOVE_SPEED_SCALE = 1;

/** @type {{ x: number, y: number }} */
export const labCamera = { x: 0, y: 0 };

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

function syncCameraToPlayer(worldState) {
    labCamera.x = worldState.player.x;
    labCamera.y = worldState.player.y;
}

function drawLabWorldFrame(ctx, canvas, viewW, viewH, worldState, profileId, gameZoom, showRangeRing, weaponRange, fastNav = false) {
    worldState.phase = GamePhase.COMBAT;
    applyLabProfileOverride(worldState, profileId);
    maybeClearBakeCaches(worldState, profileId);

    syncCameraToPlayer(worldState);
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

    render3D.draw3DBuildings(ctx, worldState, viewport, {
        fastNav,
        textureEnabled: !fastNav,
    });

    worldState.canvasBounds = prevCanvasBounds;

    if (showRangeRing) {
        drawWeaponRangeRing(ctx, worldState.player.x, worldState.player.y, weaponRange);
    }

    drawPlayerMarker(ctx, worldState.player.x, worldState.player.y);

    ctx.restore();

    return { zoom: gameZoom, cameraX, cameraY };
}

/**
 * Full generated map preview — camera locked to player (combat-style).
 * @param {HTMLCanvasElement} canvas
 * @param {{ worldState: object, profileId: string, gameZoom: number, showRangeRing: boolean, weaponRange: number, viewWidth: number, viewHeight: number }} options
 */
export function renderGamePreview(canvas, options) {
    const { worldState, profileId, gameZoom, showRangeRing, weaponRange, viewWidth, viewHeight, fastNav = false } = options;

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
        showRangeRing,
        weaponRange,
        fastNav
    );
    if (!fastNav) {
        lastQualityRenderAt = performance.now();
    }
    return result;
}

let lastFrameRenderAt = 0;

/** Throttled map redraw while moving — solid wall fills; textured pass when idle. */
export function requestNavMapRender(renderFn) {
    if (navRenderPending) {
        return;
    }
    navRenderPending = true;
    requestAnimationFrame(() => {
        navRenderPending = false;
        const now = performance.now();
        if (now - lastFrameRenderAt < NAV_RENDER_INTERVAL_MS) {
            return;
        }
        lastFrameRenderAt = now;
        renderFn({ fastNav: isNavigating });
    });
}

/** Full-quality textured pass after movement stops or settings change. */
export function requestQualityMapRender(renderFn) {
    lastQualityRenderAt = performance.now();
    renderFn({ fastNav: false });
}

export function setLabNavigating(active) {
    isNavigating = active;
}

/** Invalidate baked floor/wall caches after profile or floor seed change. */
export function invalidateMapPreviewBakes() {
    lastBakeKey = "";
}

/**
 * WASD / arrows move player; drag moves player; wheel zoom. Camera follows player.
 * @param {() => { worldState?: object, gameZoom?: number }} getOptions
 * @param {(reason: string) => void} onChange
 */
export function initMapPreviewNavigation(getOptions, onChange) {
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
        syncCameraToPlayer(world);
        setLabNavigating(true);
        onChange("move");
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
            setLabNavigating(false);
            onChange("idle-quality");
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
            onChange("zoom");
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
            syncCameraToPlayer(world);
            setLabNavigating(true);
            onChange("drag");
        });

        const endDrag = () => {
            if (dragState?.canvas === canvas) {
                dragState = null;
                setLabNavigating(false);
                onChange("idle-quality");
            }
        };
        canvas.addEventListener("pointerup", endDrag);
        canvas.addEventListener("pointercancel", endDrag);
    }
}

export function focusCameraOnPlayer(worldState) {
    if (!worldState) {
        return;
    }
    syncCameraToPlayer(worldState);
}
