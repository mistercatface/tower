import { generateLabCaverns, generateLabRailCaverns, PLAY_AREA_CELL_OPTIONS, playAreaCellsToIndex, syncCavernBoundsFromPlay } from "../world/mapWorld.js";
import { buildMapWallToolPanel } from "./mapWallTool.js";
import { migrateCavernConfigForMode } from "../world/cavernBounds.js";
import { paintMapOverviewFrame } from "./mapOverview.js";
import { SliderControl } from "../../../Libraries/UI/controls/SliderControl.js";
import { appendSectionTitle, addNumberField } from "./mapPanelFields.js";
/** @type {(() => void) | null} */
let mapPanelRefreshInputs = null;
export function refreshMapPanelInputs() {
    mapPanelRefreshInputs?.();
}
/** @param {string} label @param {"playAreaCols" | "playAreaRows"} key @param {import("../state.js").TileLabGameState} state @param {() => void} onPreviewChange @param {() => void} refreshBoundInputs */
function addPlayAreaSlider(panel, label, key, state, onPreviewChange, refreshBoundInputs) {
    const { playConfig, cavernConfig } = state.editor;
    const maxIndex = PLAY_AREA_CELL_OPTIONS.length - 1;
    panel.appendChild(
        new SliderControl(
            label,
            0,
            maxIndex,
            1,
            playAreaCellsToIndex(playConfig[key]),
            (index) => {
                playConfig[key] = PLAY_AREA_CELL_OPTIONS[index];
                syncCavernBoundsFromPlay(state.viewport, playConfig, cavernConfig, { center: false, syncSizeFromPlay: true });
                refreshBoundInputs();
                onPreviewChange();
            },
            (index) => `${PLAY_AREA_CELL_OPTIONS[index]} cells`,
        ).element,
    );
}
/** @param {import("../state.js").TileLabGameState} state @param {() => void} onGenerated */
export function buildMapPanel(state, onGenerated) {
    const { playConfig, cavernConfig } = state.editor;
    const surfaceSettings = state.worldSurfaces.settings;
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
    modeSelect.value = cavernConfig.boundsMode;
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
        syncCavernBoundsFromPlay(state.viewport, playConfig, cavernConfig);
        migrateCavernConfigForMode(cavernConfig);
        refreshBoundInputs();
        onPreviewChange();
    });
    syncRow.appendChild(syncBtn);
    cavernSection.appendChild(syncRow);
    addNumberField(
        rectFields,
        "Bounds col",
        () => cavernConfig.boundsCol,
        (v) => {
            cavernConfig.boundsCol = Math.round(v);
            migrateCavernConfigForMode(cavernConfig);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        rectFields,
        "Bounds row",
        () => cavernConfig.boundsRow,
        (v) => {
            cavernConfig.boundsRow = Math.round(v);
            migrateCavernConfigForMode(cavernConfig);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        rectFields,
        "Bounds cols",
        () => cavernConfig.boundsCols,
        (v) => {
            cavernConfig.boundsCols = Math.max(1, Math.round(v));
            migrateCavernConfigForMode(cavernConfig);
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        rectFields,
        "Bounds rows",
        () => cavernConfig.boundsRows,
        (v) => {
            cavernConfig.boundsRows = Math.max(1, Math.round(v));
            migrateCavernConfigForMode(cavernConfig);
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        circleFields,
        "Center col",
        () => cavernConfig.centerCol,
        (v) => {
            cavernConfig.centerCol = Math.round(v);
            migrateCavernConfigForMode(cavernConfig);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        circleFields,
        "Center row",
        () => cavernConfig.centerRow,
        (v) => {
            cavernConfig.centerRow = Math.round(v);
            migrateCavernConfigForMode(cavernConfig);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        circleFields,
        "Radius (cells)",
        () => cavernConfig.outerRadiusCells,
        (v) => {
            cavernConfig.outerRadiusCells = Math.max(1, Math.round(v));
            migrateCavernConfigForMode(cavernConfig);
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        donutFields,
        "Donut thickness (cells)",
        () => cavernConfig.donutThicknessCells,
        (v) => {
            cavernConfig.donutThicknessCells = Math.max(1, Math.min(cavernConfig.outerRadiusCells - 1, Math.round(v)));
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    const updateModeVisibility = () => {
        rectFields.hidden = cavernConfig.boundsMode !== "rect";
        circleFields.hidden = cavernConfig.boundsMode === "rect";
        donutFields.hidden = cavernConfig.boundsMode !== "donut";
    };
    modeSelect.addEventListener("change", () => {
        cavernConfig.boundsMode = /** @type {"rect" | "circle" | "donut"} */ (modeSelect.value);
        migrateCavernConfigForMode(cavernConfig);
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
                cavernConfig[key],
                (val) => {
                    cavernConfig[key] = val;
                },
                format,
            ).element,
        );
    };
    addSlider("Rock density", 0.2, 0.7, 0.05, "fillChance", (v) => `${Math.round(v * 100)}%`);
    addSlider("Smooth passes", 1, 8, 1, "iterations");
    addSlider("Wall height", 1, surfaceSettings.maxWallHeightLevel, 1, "wallHeightLevel");
    const previewLabel = document.createElement("label");
    previewLabel.className = "check-inline editor-map-preview-toggle";
    const previewInput = document.createElement("input");
    previewInput.type = "checkbox";
    previewInput.checked = state.editor.showMapOverviewGenBounds;
    previewInput.addEventListener("change", () => {
        state.editor.showMapOverviewGenBounds = previewInput.checked;
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
    const railSection = document.createElement("div");
    railSection.className = "editor-block";
    appendSectionTitle(railSection, "Rail wall generation");
    const railHint = document.createElement("p");
    railHint.className = "editor-hint";
    railHint.textContent = "Purple overlay on map overview — drag inside to move, drag edges/rings to resize.";
    railSection.appendChild(railHint);
    const railModeField = document.createElement("label");
    railModeField.className = "param-field";
    const railModeLabel = document.createElement("span");
    railModeLabel.textContent = "Bounds shape";
    const railModeSelect = document.createElement("select");
    for (const mode of ["rect", "circle", "donut"]) {
        const opt = document.createElement("option");
        opt.value = mode;
        opt.textContent = mode === "rect" ? "Rectangle" : mode === "circle" ? "Circle" : "Donut";
        railModeSelect.appendChild(opt);
    }
    const railConfig = state.editor.railConfig;
    railModeSelect.value = railConfig.boundsMode;
    railModeField.append(railModeLabel, railModeSelect);
    railSection.appendChild(railModeField);
    const railRectFields = document.createElement("div");
    const railCircleFields = document.createElement("div");
    const railDonutFields = document.createElement("div");
    const railSyncRow = document.createElement("div");
    railSyncRow.className = "editor-tools-row";
    const railSyncBtn = document.createElement("button");
    railSyncBtn.type = "button";
    railSyncBtn.className = "secondary";
    railSyncBtn.textContent = "Center bounds on camera";
    railSyncBtn.addEventListener("click", () => {
        syncCavernBoundsFromPlay(state.viewport, playConfig, railConfig);
        migrateCavernConfigForMode(railConfig);
        refreshBoundInputs();
        onPreviewChange();
    });
    railSyncRow.appendChild(railSyncBtn);
    railSection.appendChild(railSyncRow);
    addNumberField(
        railRectFields,
        "Bounds col",
        () => railConfig.boundsCol,
        (v) => {
            railConfig.boundsCol = Math.round(v);
            migrateCavernConfigForMode(railConfig);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        railRectFields,
        "Bounds row",
        () => railConfig.boundsRow,
        (v) => {
            railConfig.boundsRow = Math.round(v);
            migrateCavernConfigForMode(railConfig);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        railRectFields,
        "Bounds cols",
        () => railConfig.boundsCols,
        (v) => {
            railConfig.boundsCols = Math.max(1, Math.round(v));
            migrateCavernConfigForMode(railConfig);
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        railRectFields,
        "Bounds rows",
        () => railConfig.boundsRows,
        (v) => {
            railConfig.boundsRows = Math.max(1, Math.round(v));
            migrateCavernConfigForMode(railConfig);
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        railCircleFields,
        "Center col",
        () => railConfig.centerCol,
        (v) => {
            railConfig.centerCol = Math.round(v);
            migrateCavernConfigForMode(railConfig);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        railCircleFields,
        "Center row",
        () => railConfig.centerRow,
        (v) => {
            railConfig.centerRow = Math.round(v);
            migrateCavernConfigForMode(railConfig);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        railCircleFields,
        "Radius (cells)",
        () => railConfig.outerRadiusCells,
        (v) => {
            railConfig.outerRadiusCells = Math.max(1, Math.round(v));
            migrateCavernConfigForMode(railConfig);
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        railDonutFields,
        "Donut thickness (cells)",
        () => railConfig.donutThicknessCells,
        (v) => {
            railConfig.donutThicknessCells = Math.max(1, Math.min(railConfig.outerRadiusCells - 1, Math.round(v)));
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    const updateRailModeVisibility = () => {
        railRectFields.hidden = railConfig.boundsMode !== "rect";
        railCircleFields.hidden = railConfig.boundsMode === "rect";
        railDonutFields.hidden = railConfig.boundsMode !== "donut";
    };
    railModeSelect.addEventListener("change", () => {
        railConfig.boundsMode = /** @type {"rect" | "circle" | "donut"} */ (railModeSelect.value);
        migrateCavernConfigForMode(railConfig);
        refreshBoundInputs();
        updateRailModeVisibility();
        onPreviewChange();
    });
    railSection.append(railRectFields, railCircleFields, railDonutFields);
    updateRailModeVisibility();
    const addRailSlider = (label, min, max, step, key, format = (v) => String(v)) => {
        railSection.appendChild(
            new SliderControl(
                label,
                min,
                max,
                step,
                railConfig[key],
                (val) => {
                    railConfig[key] = val;
                },
                format,
            ).element,
        );
    };
    addRailSlider("Rock density", 0.2, 0.7, 0.05, "fillChance", (v) => `${Math.round(v * 100)}%`);
    addRailSlider("Smooth passes", 1, 8, 1, "iterations");
    addRailSlider("Wall height", 1, surfaceSettings.maxWallHeightLevel, 1, "wallHeightLevel");
    addRailSlider("Wall thickness", 1, 4, 1, "edgeThickness");
    const railPreviewLabel = document.createElement("label");
    railPreviewLabel.className = "check-inline editor-map-preview-toggle";
    const railPreviewInput = document.createElement("input");
    railPreviewInput.type = "checkbox";
    railPreviewInput.checked = state.editor.showMapOverviewRailBounds;
    railPreviewInput.addEventListener("change", () => {
        state.editor.showMapOverviewRailBounds = railPreviewInput.checked;
        onPreviewChange();
    });
    railPreviewLabel.append(railPreviewInput, document.createTextNode(" Show rail bounds on map overview"));
    railSection.appendChild(railPreviewLabel);
    panel.appendChild(railSection);
    const railRow = document.createElement("div");
    railRow.className = "editor-tools-row";
    const genRailBtn = document.createElement("button");
    genRailBtn.type = "button";
    genRailBtn.textContent = "Generate rail walls";
    genRailBtn.addEventListener("click", () => {
        generateLabRailCaverns(state);
        onGenerated();
    });
    railRow.appendChild(genRailBtn);
    panel.appendChild(railRow);
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
