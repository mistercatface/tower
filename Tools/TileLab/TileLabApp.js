import { listShippedFloorProfileIds } from "../../Config/floorProceduralConfig.js";
import { initMapPreviewNavigation } from "./map/LabMapPreview.js";
import {
    invalidateLabCaches,
    registerEditorProfiles,
    renderMapPreview,
} from "./LabMapView.js";
import {
    readControls,
    applyGameDefaultsToForm,
    syncCombatZoomToStage,
    initPresetSelect,
    initToolbarDefaults,
    bindToolbarControls,
} from "./LabToolbar.js";
import { ensureLabWorld, getLabWorld, resetLabWorld } from "./LabWorldSession.js";
import { initProfileEditor } from "./profile/ProfileEditor.js";

let mapPreviewTimer = null;
let fullRenderTimer = null;
let isPlaying = true;

function scheduleMapPreview() {
    if (mapPreviewTimer != null) {
        clearTimeout(mapPreviewTimer);
    }
    mapPreviewTimer = setTimeout(() => {
        mapPreviewTimer = null;
        const ctrl = readControls();
        const world = getLabWorld() ?? ensureLabWorld(ctrl);
        if (world) {
            invalidateLabCaches();
            world.floorTiles.clear();
            renderMapPreview(ctrl, world);
        }
    }, 400);
}

function renderLightweight() {
    registerEditorProfiles();
    scheduleMapPreview();
}

function renderAll() {
    registerEditorProfiles();

    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    applyGameDefaultsToForm(world);

    invalidateLabCaches();
    world.floorTiles.clear();

    renderMapPreview(ctrl, world);
}

function scheduleFullRender() {
    if (fullRenderTimer != null) {
        clearTimeout(fullRenderTimer);
    }
    fullRenderTimer = setTimeout(() => {
        fullRenderTimer = null;
        renderAll();
    }, 300);
}

function handleEditorChange(options = {}) {
    if (options.lightweight) {
        renderLightweight();
        return;
    }
    scheduleFullRender();
}

function onStageResize() {
    applyGameDefaultsToForm(getLabWorld());
    syncCombatZoomToStage(getLabWorld());
}

function mapPreviewLoop() {
    const ctrl = readControls();
    const world = ensureLabWorld(ctrl);
    if (world) {
        renderMapPreview(ctrl, world);
    }
    requestAnimationFrame(mapPreviewLoop);
}

function setPlayState(playing) {
    isPlaying = playing;
    const playBtn = document.getElementById("playBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    if (playBtn) playBtn.disabled = playing;
    if (pauseBtn) pauseBtn.disabled = !playing;
}

document.getElementById("playBtn")?.addEventListener("click", () => setPlayState(true));
document.getElementById("pauseBtn")?.addEventListener("click", () => setPlayState(false));

initPresetSelect(listShippedFloorProfileIds());
initProfileEditor({ onChange: handleEditorChange });
initMapPreviewNavigation(() => ({ ...readControls(), worldState: getLabWorld() }));
bindToolbarControls({
    onRender: () => renderAll(),
    onResetMap: resetLabWorld,
    onStageResize,
});

initToolbarDefaults();

function bootstrap() {
    registerEditorProfiles();
    setPlayState(true);

    requestAnimationFrame(() => {
        const ctrl = readControls();
        const world = ensureLabWorld(ctrl);
        applyGameDefaultsToForm(world);
        syncCombatZoomToStage(world);
        mapPreviewLoop();
        requestAnimationFrame(appLoop);
    });
}

let lastRafTime = 0;
function appLoop(timestamp) {
    if (lastRafTime === 0) lastRafTime = timestamp;
    const dt = timestamp - lastRafTime;
    lastRafTime = timestamp;

    if (isPlaying) {
        const world = getLabWorld();
        if (world) {
            world.gameTime = (world.gameTime || 0) + dt;
        }
    }

    requestAnimationFrame(appLoop);
}

bootstrap();
