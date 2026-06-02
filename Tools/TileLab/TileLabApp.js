import { gridSettings, floorTileSettings, playerBaseStats } from "../../Config/Config.js";
import {
    floorProceduralProfiles,
    defaultFloorProceduralProfileId,
    registerLabProceduralProfile,
} from "../../Config/floorProceduralConfig.js";
import { clearFlatWallFaceCache } from "../../Render/3D/WallFaceTexture.js";
import {
    renderGamePreview,
    prepareGameCanvas,
    initMapPreviewNavigation,
    labCamera,
    invalidateMapPreviewBakes,
    requestNavMapRender,
    requestQualityMapRender,
} from "./map/LabMapPreview.js";
import { getGameLabDefaults, computeCombatZoom } from "./LabSettings.js";
import {
    createLabMapWorld,
    focusLabNode,
    listLabMapNodes,
} from "./map/LabMapWorld.js";
import {
    initProfileEditor,
    getActiveLabProfiles,
    LAB_PROFILE_A,
} from "./profile/ProfileEditor.js";
import {
    renderTileInspectPreviews,
    downloadInspectExport,
} from "./inspect/TileInspectBakes.js";

const PROFILE_IDS = Object.keys(floorProceduralProfiles)
    .filter((id) => !id.startsWith("__lab"))
    .sort();

const LAB_PROFILE_MAIN = LAB_PROFILE_A;

/** @type {import("../../GameState/GameState.js").GameState | null} */
let labWorld = null;
let labWorldMapSeed = null;
/** @type {ReturnType<typeof renderTileInspectPreviews> | null} */
let inspectSources = null;

function registerEditorProfiles() {
    const { profileA } = getActiveLabProfiles();
    registerLabProceduralProfile(LAB_PROFILE_A, profileA);
}

function invalidateLabCaches() {
    clearFlatWallFaceCache();
    invalidateMapPreviewBakes();
}

function syncGameCanvasSize() {
    const stage = document.getElementById("mapStage");
    const canvas = document.getElementById("gamePreview");
    const size = prepareGameCanvas(canvas, stage);
    if (!size) {
        return null;
    }
    if (size.changed) {
        invalidateMapPreviewBakes();
    }
    return size;
}

function populateNodeSelect(state) {
    const select = document.getElementById("mapNodeSelect");
    if (!select || !state) {
        return;
    }
    const prev = Number(select.value) || 0;
    select.innerHTML = "";
    for (const node of listLabMapNodes(state)) {
        const opt = document.createElement("option");
        opt.value = String(node.id);
        opt.textContent = `${node.id}·L${node.layer}`;
        select.appendChild(opt);
    }
    select.value = state.getMapNode(prev) ? String(prev) : "0";
}

function ensureLabWorld(ctrl, forceRegen = false) {
    const mapSeed = Number(document.getElementById("mapSeedInput")?.value) || 1;
    if (!labWorld || forceRegen || labWorldMapSeed !== mapSeed) {
        labWorld = createLabMapWorld({
            mapSeed,
            floorTileSeed: ctrl.seed,
        });
        labWorldMapSeed = mapSeed;
        populateNodeSelect(labWorld);
    } else if (labWorld.floorTileSeed !== ctrl.seed) {
        labWorld.floorTileSeed = ctrl.seed;
        labWorld.floorTiles.clear();
        invalidateMapPreviewBakes();
    }

    const nodeId = Number(document.getElementById("mapNodeSelect")?.value) || 0;
    if (labWorld.currentNodeId !== nodeId || forceRegen) {
        const pos = focusLabNode(labWorld, nodeId);
        labCamera.x = pos.x;
        labCamera.y = pos.y;
    }

    return labWorld;
}

function readControls() {
    const cellSize = gridSettings.cellSize;
    return {
        profileId: LAB_PROFILE_MAIN,
        seed: Number(document.getElementById("seedInput").value) || 0,
        worldX: Number(document.getElementById("worldXInput").value) || 0,
        worldY: Number(document.getElementById("worldYInput").value) || 0,
        cellSize,
        zoom: Number(document.getElementById("zoomInput").value) || 6,
        storyRow: Number(document.getElementById("storyRowInput").value) || 0,
        storyCount: floorTileSettings.wallTextureStories,
        gameZoom: Number(document.getElementById("gameZoomInput").value) || 1,
        weaponRange: labWorld?.player?.weapon?.range ?? playerBaseStats.range,
        showRangeRing: document.getElementById("showRangeRingInput").checked,
    };
}

function syncCombatZoomToStage(world) {
    const stage = document.getElementById("mapStage");
    const rect = stage?.getBoundingClientRect();
    const viewW = Math.max(320, Math.floor(rect?.width ?? 800));
    const viewH = Math.max(240, Math.floor(rect?.height ?? 600));
    const zoom = computeCombatZoom(viewW, viewH, world?.player?.weapon?.range ?? playerBaseStats.range);
    const zoomEl = document.getElementById("gameZoomInput");
    if (zoomEl) {
        zoomEl.value = String(zoom.toFixed(2));
        document.getElementById("gameZoomValue").textContent = zoomEl.value;
    }
}

function applyGameDefaultsToForm(world) {
    const stage = document.getElementById("mapStage");
    const rect = stage?.getBoundingClientRect();
    const viewW = Math.max(320, Math.floor(rect?.width ?? 800));
    const viewH = Math.max(240, Math.floor(rect?.height ?? 600));
    const defaults = getGameLabDefaults(viewW, viewH, world);

    const cellEl = document.getElementById("cellSizeInput");
    if (cellEl) {
        cellEl.value = String(defaults.cellSize);
    }
    const storiesEl = document.getElementById("storyCountInput");
    if (storiesEl) {
        storiesEl.value = String(defaults.storyCount);
    }
    const worldXEl = document.getElementById("worldXInput");
    const worldYEl = document.getElementById("worldYInput");
    if (worldXEl) {
        worldXEl.step = String(defaults.cellSize);
    }
    if (worldYEl) {
        worldYEl.step = String(defaults.cellSize);
    }

    const rangeMeta = document.getElementById("rangeMeta");
    if (rangeMeta) {
        rangeMeta.textContent = `range ${defaults.weaponRange}`;
    }
}

function renderMapPreview(ctrl, world, { fastNav = false } = {}) {
    const size = syncGameCanvasSize();
    if (!size) {
        return;
    }
    renderGamePreview(document.getElementById("gamePreview"), {
        worldState: world,
        profileId: LAB_PROFILE_A,
        gameZoom: ctrl.gameZoom,
        showRangeRing: ctrl.showRangeRing,
        weaponRange: ctrl.weaponRange,
        viewWidth: size.width,
        viewHeight: size.height,
        fastNav,
    });
    const gameMeta = document.getElementById("gameMetaLine");
    if (gameMeta && world) {
        const node = world.getCurrentMapNode();
        const mode = fastNav ? "move" : "full";
        gameMeta.textContent =
            `node ${world.currentNodeId} ${node?.strategy ?? ""} · map ${labWorldMapSeed} · ` +
            `player ${Math.round(world.player.x)},${Math.round(world.player.y)} · ` +
            `zoom ${ctrl.gameZoom.toFixed(2)} · range ${ctrl.weaponRange} · ${mode} · WASD`;
    }
}

function runMapPreviewPass({ fastNav = false } = {}) {
    registerEditorProfiles();
    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    if (world) {
        renderMapPreview(ctrl, world, { fastNav });
    }
}

function renderAll() {
    registerEditorProfiles();
    invalidateLabCaches();

    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    applyGameDefaultsToForm(world);

    inspectSources = renderTileInspectPreviews(ctrl);
    renderMapPreview(ctrl, world);
}

function exportActive() {
    const pick = document.getElementById("exportTarget").value;
    downloadInspectExport(inspectSources, pick);
}

function initPresetSelect() {
    const select = document.getElementById("presetSelect");
    for (const id of PROFILE_IDS) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        select.appendChild(opt);
    }
    select.value = defaultFloorProceduralProfileId;
}

function initTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    const panels = document.querySelectorAll(".tab-panel");
    for (const btn of buttons) {
        btn.addEventListener("click", () => {
            buttons.forEach((b) => b.classList.remove("active"));
            panels.forEach((p) => p.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add("active");
        });
    }
}

function bindControls() {
    const rerender = () => renderAll();
    const ids = [
        "seedInput",
        "worldXInput",
        "worldYInput",
        "zoomInput",
        "storyRowInput",
        "gameZoomInput",
        "mapSeedInput",
        "mapNodeSelect",
        "showRangeRingInput",
    ];
    for (const id of ids) {
        document.getElementById(id)?.addEventListener("input", rerender);
        document.getElementById(id)?.addEventListener("change", rerender);
    }
    document.getElementById("gameZoomValue").textContent = document.getElementById("gameZoomInput").value;
    document.getElementById("gameZoomInput").addEventListener("input", (e) => {
        document.getElementById("gameZoomValue").textContent = e.target.value;
        renderAll();
    });
    document.getElementById("zoomValue").textContent = document.getElementById("zoomInput").value;
    document.getElementById("zoomInput").addEventListener("input", (e) => {
        document.getElementById("zoomValue").textContent = e.target.value;
        renderAll();
    });
    document.getElementById("regenerateBtn").addEventListener("click", rerender);
    document.getElementById("exportBtn").addEventListener("click", exportActive);
    document.getElementById("randomSeedBtn").addEventListener("click", () => {
        document.getElementById("seedInput").value = String(Math.floor(Math.random() * 1_000_000));
        renderAll();
    });
    document.getElementById("regenMapBtn").addEventListener("click", () => {
        labWorld = null;
        renderAll();
    });
    document.getElementById("mapNodeSelect")?.addEventListener("change", () => {
        if (labWorld) {
            const pos = focusLabNode(labWorld, Number(document.getElementById("mapNodeSelect").value) || 0);
            labCamera.x = pos.x;
            labCamera.y = pos.y;
            renderAll();
        }
    });

    const stage = document.getElementById("mapStage");
    if (stage && typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => {
            applyGameDefaultsToForm(labWorld);
            syncCombatZoomToStage(labWorld);
            requestQualityMapRender(({ fastNav }) => runMapPreviewPass({ fastNav }));
        });
        ro.observe(stage);
    }
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            renderAll();
            syncCombatZoomToStage(labWorld);
        });
    });
}

function onMapNavChange(reason) {
    if (reason === "idle-quality" || reason === "zoom") {
        requestQualityMapRender(({ fastNav }) => runMapPreviewPass({ fastNav }));
        return;
    }
    requestNavMapRender(({ fastNav }) => runMapPreviewPass({ fastNav }));
}

initPresetSelect();
initTabs();
initProfileEditor({ onChange: renderAll });
initMapPreviewNavigation(() => ({ ...readControls(), worldState: labWorld }), onMapNavChange);
bindControls();
document.getElementById("mapSeedInput").value = "42";
document.getElementById("cellSizeInput").value = String(gridSettings.cellSize);
document.getElementById("storyCountInput").value = String(floorTileSettings.wallTextureStories ?? 8);
document.getElementById("seedInput").value = "42";
const gameZoomEl = document.getElementById("gameZoomInput");
if (gameZoomEl) {
    const z = computeCombatZoom(800, 600, playerBaseStats.range);
    gameZoomEl.value = String(z.toFixed(2));
    document.getElementById("gameZoomValue").textContent = gameZoomEl.value;
}
