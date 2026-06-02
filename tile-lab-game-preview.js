import { GamePhase } from "./GameState/GamePhase.js";
import { clearFlatWallFaceCache } from "./Render/3D/WallFaceTexture.js";
import { Render3D } from "./Render/3D/Render3D.js";
import { Viewport } from "./Render/Viewport.js";
import { isWorldScene } from "./GameState/GamePhase.js";
import { applyLabProfileOverride } from "./tile-lab-map-world.js";

const render3D = new Render3D();
const lastBakeKeyBySlot = { a: "", b: "" };

/** @type {{ x: number, y: number }} */
export const labCamera = { x: 0, y: 0 };

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

function maybeClearBakeCaches(slot, worldState, profileId) {
    const key = `${profileId}:${worldState.floorTileSeed}`;
    if (lastBakeKeyBySlot[slot] === key) {
        return;
    }
    lastBakeKeyBySlot[slot] = key;
    worldState.floorTiles.clear();
    clearFlatWallFaceCache();
}

function syncCameraToPlayer(worldState) {
    labCamera.x = worldState.player.x;
    labCamera.y = worldState.player.y;
}

function drawLabWorldFrame(ctx, canvas, slot, worldState, profileId, gameZoom, showRangeRing, weaponRange) {
    worldState.phase = GamePhase.COMBAT;
    applyLabProfileOverride(worldState, profileId);
    maybeClearBakeCaches(slot, worldState, profileId);

    syncCameraToPlayer(worldState);
    const cameraX = worldState.player.x;
    const cameraY = worldState.player.y;

    const viewport = new Viewport(cameraX, cameraY, gameZoom);
    viewport.cx = canvas.width / 2;
    viewport.cy = canvas.height / 2;
    viewport.zoom = gameZoom;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    viewport.apply(ctx);

    if (isWorldScene(worldState.phase)) {
        worldState.floorTiles.draw(ctx, worldState, viewport);
    }

    render3D.draw3DBuildings(ctx, worldState, viewport);

    if (showRangeRing) {
        drawWeaponRangeRing(ctx, worldState.player.x, worldState.player.y, weaponRange);
    }

    drawPlayerMarker(ctx, worldState.player.x, worldState.player.y);

    ctx.restore();

    return { zoom: gameZoom, cameraX, cameraY };
}

/** Full generated map preview — camera locked to player (combat-style). */
export function renderGamePreview(canvas, options) {
    const { worldState, profileId, gameZoom, showRangeRing, weaponRange } = options;

    if (!worldState || !profileId) {
        return { zoom: gameZoom };
    }

    const slot = canvas.id === "gamePreviewB" ? "b" : "a";
    const ctx = canvas.getContext("2d");
    return drawLabWorldFrame(
        ctx,
        canvas,
        slot,
        worldState,
        profileId,
        gameZoom,
        showRangeRing,
        weaponRange
    );
}

/** Invalidate baked floor/wall caches after profile or floor seed change. */
export function invalidateMapPreviewBakes() {
    lastBakeKeyBySlot.a = "";
    lastBakeKeyBySlot.b = "";
}

/**
 * WASD / arrows move player; drag moves player; wheel zoom. Camera follows player.
 * @param {() => { worldState?: object, gameZoom?: number }} getOptions
 * @param {(reason: string) => void} onChange
 */
export function initMapPreviewNavigation(getOptions, onChange) {
    const canvases = () => [
        document.getElementById("gamePreviewA"),
        document.getElementById("gamePreviewB"),
    ].filter(Boolean);

    const moveKeys = new Set();
    let moveRaf = null;

    const moveSpeed = () => 280 / (getOptions().gameZoom || 1);

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
            onChange("drag");
        });

        canvas.addEventListener("pointerup", () => {
            dragState = null;
        });
        canvas.addEventListener("pointercancel", () => {
            dragState = null;
        });
    }
}

export function focusCameraOnPlayer(worldState) {
    if (!worldState) {
        return;
    }
    syncCameraToPlayer(worldState);
}
