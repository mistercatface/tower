import { generateLabCaverns, PLAY_AREA_CELL_OPTIONS, playAreaCellsToIndex, syncCavernBoundsFromPlay } from "../world/mapWorld.js";
import { buildMapWallToolPanel } from "./mapWallTool.js";
import { migrateCavernConfigForMode } from "../world/cavernBounds.js";
import { formatStampWallHeightLevel, STAMP_WALL_LEVEL_INFINI, STAMP_WALL_LEVEL_MIN } from "../../../Libraries/WorldSurface/stampWallHeight.js";
import { paintMapOverviewFrame } from "./mapOverview.js";
import { SliderControl } from "./controls/SliderControl.js";
import { appendSectionTitle, addNumberField } from "./mapPanelFields.js";
/** @type {(() => void) | null} */
let mapPanelRefreshInputs = null;
export function refreshMapPanelInputs() {
    mapPanelRefreshInputs?.();
}
/** @param {string} label @param {"playAreaCols" | "playAreaRows"} key @param {import("../state.js").TileLabGameState} state @param {() => void} onPreviewChange @param {() => void} refreshBoundInputs */
function addPlayAreaSlider(panel, label, key, state, onPreviewChange, refreshBoundInputs) {
    const { labPlayConfig, labCavernConfig } = state;
    const maxIndex = PLAY_AREA_CELL_OPTIONS.length - 1;
    panel.appendChild(
        new SliderControl(
            label,
            0,
            maxIndex,
            1,
            playAreaCellsToIndex(labPlayConfig[key]),
            (index) => {
                labPlayConfig[key] = PLAY_AREA_CELL_OPTIONS[index];
                syncCavernBoundsFromPlay(state.viewport, labPlayConfig, labCavernConfig, { center: false, syncSizeFromPlay: true });
                refreshBoundInputs();
                onPreviewChange();
            },
            (index) => `${PLAY_AREA_CELL_OPTIONS[index]} cells`,
        ).element,
    );
}
/** @param {import("../state.js").TileLabGameState} state @param {() => void} onGenerated */
export function buildMapPanel(state, onGenerated) {
    const { labPlayConfig, labCavernConfig } = state;
    const panel = document.getElementById("mapSettingsPanel");
    panel.innerHTML = "";
    const onPreviewChange = () => paintMapOverviewFrame(state);
    /** @type {{ input: HTMLInputElement, getValue: () => number }[]} */
    const boundInputs = [];
    const refreshBoundInputs = () => {
        for (let i = 0; i < boundInputs.length; i++) boundInputs[i].input.value = String(boundInputs[i].getValue());
    };
    const playSection = document.createElement("div");
    playSection.className = "editor-block";
    appendSectionTitle(playSection, "Play area");
    const playHint = document.createElement("p");
    playHint.className = "editor-hint";
    playHint.textContent = "Obstacle grid size — centered on the camera when you generate.";
    playSection.appendChild(playHint);
    addPlayAreaSlider(playSection, "Play width", "playAreaCols", state, onPreviewChange, refreshBoundInputs);
    addPlayAreaSlider(playSection, "Play height", "playAreaRows", state, onPreviewChange, refreshBoundInputs);
    panel.appendChild(playSection);
    const cavernSection = document.createElement("div");
    cavernSection.className = "editor-block";
    appendSectionTitle(cavernSection, "Cavern generation");
    const cavernHint = document.createElement("p");
    cavernHint.className = "editor-hint";
    cavernHint.textContent = "Orange overlay on map overview — drag inside to move, drag edges/rings to resize.";
    cavernSection.appendChild(cavernHint);
    const modeField = document.createElement("label");
    modeField.className = "param-field";
    const modeLabel = document.createElement("span");
    modeLabel.textContent = "Bounds shape";
    const modeSelect = document.createElement("select");
    for (const mode of ["rect", "circle", "donut"]) {
        const opt = document.createElement("option");
        opt.value = mode;
        opt.textContent = mode === "rect" ? "Rectangle" : mode === "circle" ? "Circle" : "Donut";
        modeSelect.appendChild(opt);
    }
    modeSelect.value = labCavernConfig.boundsMode;
    modeField.append(modeLabel, modeSelect);
    cavernSection.appendChild(modeField);
    const rectFields = document.createElement("div");
    const circleFields = document.createElement("div");
    const donutFields = document.createElement("div");
    const syncRow = document.createElement("div");
    syncRow.className = "editor-tools-row";
    const syncBtn = document.createElement("button");
    syncBtn.type = "button";
    syncBtn.className = "secondary";
    syncBtn.textContent = "Center bounds on camera";
    syncBtn.addEventListener("click", () => {
        syncCavernBoundsFromPlay(state.viewport, labPlayConfig, labCavernConfig);
        migrateCavernConfigForMode(labCavernConfig);
        refreshBoundInputs();
        onPreviewChange();
    });
    syncRow.appendChild(syncBtn);
    cavernSection.appendChild(syncRow);
    addNumberField(
        rectFields,
        "Bounds col",
        () => labCavernConfig.boundsCol,
        (v) => {
            labCavernConfig.boundsCol = Math.round(v);
            migrateCavernConfigForMode(labCavernConfig);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        rectFields,
        "Bounds row",
        () => labCavernConfig.boundsRow,
        (v) => {
            labCavernConfig.boundsRow = Math.round(v);
            migrateCavernConfigForMode(labCavernConfig);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        rectFields,
        "Bounds cols",
        () => labCavernConfig.boundsCols,
        (v) => {
            labCavernConfig.boundsCols = Math.max(1, Math.round(v));
            migrateCavernConfigForMode(labCavernConfig);
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        rectFields,
        "Bounds rows",
        () => labCavernConfig.boundsRows,
        (v) => {
            labCavernConfig.boundsRows = Math.max(1, Math.round(v));
            migrateCavernConfigForMode(labCavernConfig);
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        circleFields,
        "Center col",
        () => labCavernConfig.centerCol,
        (v) => {
            labCavernConfig.centerCol = Math.round(v);
            migrateCavernConfigForMode(labCavernConfig);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        circleFields,
        "Center row",
        () => labCavernConfig.centerRow,
        (v) => {
            labCavernConfig.centerRow = Math.round(v);
            migrateCavernConfigForMode(labCavernConfig);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        circleFields,
        "Radius (cells)",
        () => labCavernConfig.outerRadiusCells,
        (v) => {
            labCavernConfig.outerRadiusCells = Math.max(1, Math.round(v));
            migrateCavernConfigForMode(labCavernConfig);
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        donutFields,
        "Donut thickness (cells)",
        () => labCavernConfig.donutThicknessCells,
        (v) => {
            labCavernConfig.donutThicknessCells = Math.max(1, Math.min(labCavernConfig.outerRadiusCells - 1, Math.round(v)));
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    const updateModeVisibility = () => {
        rectFields.hidden = labCavernConfig.boundsMode !== "rect";
        circleFields.hidden = labCavernConfig.boundsMode === "rect";
        donutFields.hidden = labCavernConfig.boundsMode !== "donut";
    };
    modeSelect.addEventListener("change", () => {
        labCavernConfig.boundsMode = /** @type {"rect" | "circle" | "donut"} */ (modeSelect.value);
        migrateCavernConfigForMode(labCavernConfig);
        refreshBoundInputs();
        updateModeVisibility();
        onPreviewChange();
    });
    cavernSection.append(rectFields, circleFields, donutFields);
    updateModeVisibility();
    const addSlider = (label, min, max, step, key, format = (v) => String(v)) => {
        cavernSection.appendChild(
            new SliderControl(
                label,
                min,
                max,
                step,
                labCavernConfig[key],
                (val) => {
                    labCavernConfig[key] = val;
                },
                format,
            ).element,
        );
    };
    addSlider("Rock density", 0.2, 0.7, 0.05, "fillChance", (v) => `${Math.round(v * 100)}%`);
    addSlider("Smooth passes", 1, 8, 1, "iterations");
    addSlider("Wall height", STAMP_WALL_LEVEL_MIN, STAMP_WALL_LEVEL_INFINI, 1, "wallHeightLevel", (v) => formatStampWallHeightLevel(v));
    const previewLabel = document.createElement("label");
    previewLabel.className = "check-inline editor-map-preview-toggle";
    const previewInput = document.createElement("input");
    previewInput.type = "checkbox";
    previewInput.checked = state.labShowMapOverviewGenBounds;
    previewInput.addEventListener("change", () => {
        state.labShowMapOverviewGenBounds = previewInput.checked;
        onPreviewChange();
    });
    previewLabel.append(previewInput, document.createTextNode(" Show bounds on map overview"));
    cavernSection.appendChild(previewLabel);
    panel.appendChild(cavernSection);
    const seedLine = document.createElement("p");
    seedLine.className = "editor-hint";
    seedLine.textContent = `Seed ${state.mapSeed}`;
    panel.appendChild(seedLine);
    const row = document.createElement("div");
    row.className = "editor-tools-row";
    const newSeedBtn = document.createElement("button");
    newSeedBtn.type = "button";
    newSeedBtn.className = "secondary";
    newSeedBtn.textContent = "New seed";
    newSeedBtn.addEventListener("click", () => {
        state.mapSeed = Math.floor(1 + Math.random() * 1_000_000_000);
        seedLine.textContent = `Seed ${state.mapSeed}`;
    });
    const genBtn = document.createElement("button");
    genBtn.type = "button";
    genBtn.textContent = "Generate caverns";
    genBtn.addEventListener("click", () => {
        generateLabCaverns(state);
        onGenerated();
    });
    row.append(newSeedBtn, genBtn);
    panel.appendChild(row);
    const wallMount = document.getElementById("mapWallToolPanel");
    const wallTool = buildMapWallToolPanel(state, wallMount, () => {
        onGenerated();
        paintMapOverviewFrame(state);
    });
    mapPanelRefreshInputs = () => {
        refreshBoundInputs();
        wallTool.refreshBoundInputs();
    };
    onPreviewChange();
}
