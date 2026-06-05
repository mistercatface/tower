import { playerBaseStats } from "../../Config/Config.js";
import { defaultSurfaceProfileId } from "../../Config/procedural/profiles.js";
import { getDefaultCombatZoom } from "../../Render/CombatViewport.js";
import { getLabWorld } from "./LabWorldSession.js";

function getStageSize() {
    const stage = document.getElementById("mapStage");
    const rect = stage?.getBoundingClientRect();
    return {
        viewW: Math.max(320, Math.floor(rect?.width ?? 800)),
        viewH: Math.max(240, Math.floor(rect?.height ?? 600)),
    };
}

export function readControls() {
    const world = getLabWorld();
    return {
        seed: Number(document.getElementById("seedInput").value) || 0,
        gameZoom: Number(document.getElementById("gameZoomInput").value) || 1,
        weaponRange: world?.player?.weapon?.range ?? playerBaseStats.range,
        showRangeRing: document.getElementById("showRangeRingInput").checked,
        showVignette: document.getElementById("showVignetteInput").checked,
    };
}

export function syncCombatZoomToStage(world) {
    const { viewW, viewH } = getStageSize();
    const zoom = getDefaultCombatZoom(viewW, viewH, world?.player?.weapon?.range ?? playerBaseStats.range);
    const zoomEl = document.getElementById("gameZoomInput");
    if (zoomEl) {
        zoomEl.value = String(zoom.toFixed(2));
        document.getElementById("gameZoomValue").textContent = zoomEl.value;
    }
}

export function applyGameDefaultsToForm(world) {
    const rangeMeta = document.getElementById("rangeMeta");
    if (rangeMeta) {
        const weaponRange = world?.player?.weapon?.range ?? playerBaseStats.range;
        rangeMeta.textContent = `range ${weaponRange}`;
    }
}

export function initPresetSelect(profileIds) {
    const select = document.getElementById("presetSelect");
    for (const id of profileIds) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        select.appendChild(opt);
    }
    select.value = defaultSurfaceProfileId;
}

export function initToolbarDefaults() {
    document.getElementById("mapSeedInput").value = "42";
    document.getElementById("seedInput").value = "42";
    const gameZoomEl = document.getElementById("gameZoomInput");
    if (gameZoomEl) {
        const z = getDefaultCombatZoom(800, 600, playerBaseStats.range);
        gameZoomEl.value = String(z.toFixed(2));
        document.getElementById("gameZoomValue").textContent = gameZoomEl.value;
    }
}

/**
 * @param {{ onRender: () => void, onStageResize: () => void }} handlers
 */
export function bindToolbarControls(handlers) {
    const { onRender, onStageResize } = handlers;
    const ids = [
        "seedInput",
        "gameZoomInput",
        "mapSeedInput",
        "mapNodeSelect",
        "showRangeRingInput",
        "showVignetteInput",
    ];
    for (const id of ids) {
        document.getElementById(id)?.addEventListener("input", onRender);
        document.getElementById(id)?.addEventListener("change", onRender);
    }
    document.getElementById("gameZoomValue").textContent = document.getElementById("gameZoomInput").value;
    document.getElementById("gameZoomInput").addEventListener("input", (e) => {
        document.getElementById("gameZoomValue").textContent = e.target.value;
        onRender();
    });
    document.getElementById("regenerateBtn").addEventListener("click", onRender);
    document.getElementById("randomSeedBtn").addEventListener("click", () => {
        document.getElementById("seedInput").value = String(Math.floor(Math.random() * 1_000_000));
        onRender();
    });
    document.getElementById("regenMapBtn").addEventListener("click", () => {
        handlers.onResetMap?.();
        onRender();
    });

    const stage = document.getElementById("mapStage");
    if (stage && typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(onStageResize);
        ro.observe(stage);
    }
}
