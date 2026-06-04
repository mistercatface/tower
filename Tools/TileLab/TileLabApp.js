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
import { initProfileEditor, buildProfileFromEditor } from "./profile/ProfileEditor.js";
import { initAnimationPreview } from "./LabAnimationPreview.js";
import { initResizer } from "../Lab/lab-shared.js";

let previewRefreshTimer = null;
let bakeRepaintRaf = null;

function redrawMapPreview() {
    const ctrl = readControls();
    const world = getLabWorld() ?? ensureLabWorld(ctrl);
    if (world) {
        renderMapPreview(ctrl, world);
    }
}

function runBakeRepaintLoop() {
    if (bakeRepaintRaf != null) {
        cancelAnimationFrame(bakeRepaintRaf);
    }
    const tick = () => {
        redrawMapPreview();
        const world = getLabWorld();
        if (world?.floorTiles?.hasPendingSurfaceBakes?.()) {
            bakeRepaintRaf = requestAnimationFrame(tick);
        } else {
            bakeRepaintRaf = null;
        }
    };
    bakeRepaintRaf = requestAnimationFrame(tick);
}

async function refreshLabPreview() {
    const ctrl = readControls();
    const world = getLabWorld() ?? ensureLabWorld(ctrl);
    if (!world) {
        return;
    }
    invalidateLabCaches();
    world.floorTiles.clear();
    await registerEditorProfiles();
    redrawMapPreview();
    runBakeRepaintLoop();
}

function schedulePreviewRefresh(debounceMs) {
    if (previewRefreshTimer != null) {
        clearTimeout(previewRefreshTimer);
    }
    if (debounceMs <= 0) {
        refreshLabPreview();
        return;
    }
    previewRefreshTimer = setTimeout(() => {
        previewRefreshTimer = null;
        refreshLabPreview();
    }, debounceMs);
}

function handleEditorChange(options = {}) {
    if (options.reloadProfile) {
        schedulePreviewRefresh(0);
        return;
    }
    if (options.lightweight) {
        schedulePreviewRefresh(150);
        return;
    }
    schedulePreviewRefresh(300);
}

function onStageResize() {
    applyGameDefaultsToForm(getLabWorld());
    syncCombatZoomToStage(getLabWorld());
    redrawMapPreview();
}

function renderAll() {
    refreshLabPreview().then(() => {
        applyGameDefaultsToForm(getLabWorld());
    });
}

initPresetSelect(listShippedFloorProfileIds());
initProfileEditor({ onChange: handleEditorChange });
initMapPreviewNavigation(
    () => ({ ...readControls(), worldState: getLabWorld() }),
    {
        onViewChange: () => {
            redrawMapPreview();
            if (getLabWorld()?.floorTiles?.hasPendingSurfaceBakes?.()) {
                runBakeRepaintLoop();
            }
        },
    },
);
bindToolbarControls({
    onRender: () => renderAll(),
    onResetMap: resetLabWorld,
    onStageResize,
});

initToolbarDefaults();


function bootstrap() {
    registerEditorProfiles().then(() => {
        initResizer("resizer", onStageResize);

        
        const animCanvas = document.getElementById("animationPreviewCanvas");
        if (animCanvas) {
            initAnimationPreview(animCanvas, buildProfileFromEditor);
        }

        const ctrl = readControls();
        const world = ensureLabWorld(ctrl);
        applyGameDefaultsToForm(world);
        syncCombatZoomToStage(world);
        redrawMapPreview();
        runBakeRepaintLoop();
    });
}

bootstrap();
