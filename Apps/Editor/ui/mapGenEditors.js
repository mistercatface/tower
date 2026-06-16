import { gridSettings } from "../../../Config/Config.js";
import { migrateMapGenBoundsForMode, syncMapGenBoundsFromPlay } from "../world/mapGenBounds.js";
import { applyPlayAreaConfig, eraseLabWallsInBounds, generateLabCaverns, generateLabRailCaverns } from "../world/mapWorld.js";
import { paintMapOverviewFrame } from "./mapOverview.js";
import { SliderControl } from "../../../Libraries/UI/controls/SliderControl.js";
import { addNumberField } from "./mapPanelFields.js";
/** @type {{ input: HTMLInputElement, getValue: () => number }[]} */
let mapGenBoundInputs = [];
export function refreshMapGenPanelInputs() {
    for (let i = 0; i < mapGenBoundInputs.length; i++) mapGenBoundInputs[i].input.value = String(mapGenBoundInputs[i].getValue());
}
/** @param {HTMLElement} parent @param {string} text */
function appendEditorHint(parent, text) {
    const hint = document.createElement("p");
    hint.className = "editor-hint";
    hint.textContent = text;
    parent.appendChild(hint);
}
/**
 * @param {HTMLElement} panel
 * @param {import("../world/mapGenBounds.js").MapGenBoundsConfig} config
 * @param {import("../state.js").TileLabGameState} state
 * @param {string} overlayHint
 * @param {() => void} onPreviewChange
 */
function appendMapGenBoundsControls(panel, config, state, overlayHint, onPreviewChange) {
    const { playConfig } = state.editor;
    const boundInputs = mapGenBoundInputs;
    appendEditorHint(panel, overlayHint);
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
    modeSelect.value = config.boundsMode;
    modeField.append(modeLabel, modeSelect);
    panel.appendChild(modeField);
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
        syncMapGenBoundsFromPlay(state.viewport, playConfig, config, gridSettings.cellSize);
        migrateMapGenBoundsForMode(config);
        refreshMapGenPanelInputs();
        onPreviewChange();
    });
    syncRow.appendChild(syncBtn);
    panel.appendChild(syncRow);
    const setBound = (setter) => (v) => {
        setter(v);
        migrateMapGenBoundsForMode(config);
    };
    const addBound = (parent, label, get, set, opts) => addNumberField(parent, label, get, setBound(set), opts, onPreviewChange, boundInputs);
    addBound(
        rectFields,
        "Bounds col",
        () => config.boundsCol,
        (v) => {
            config.boundsCol = Math.round(v);
        },
    );
    addBound(
        rectFields,
        "Bounds row",
        () => config.boundsRow,
        (v) => {
            config.boundsRow = Math.round(v);
        },
    );
    addBound(
        rectFields,
        "Bounds cols",
        () => config.boundsCols,
        (v) => {
            config.boundsCols = Math.max(1, Math.round(v));
        },
        { min: 1 },
    );
    addBound(
        rectFields,
        "Bounds rows",
        () => config.boundsRows,
        (v) => {
            config.boundsRows = Math.max(1, Math.round(v));
        },
        { min: 1 },
    );
    addBound(
        circleFields,
        "Center col",
        () => config.centerCol,
        (v) => {
            config.centerCol = Math.round(v);
        },
    );
    addBound(
        circleFields,
        "Center row",
        () => config.centerRow,
        (v) => {
            config.centerRow = Math.round(v);
        },
    );
    addBound(
        circleFields,
        "Radius (cells)",
        () => config.outerRadiusCells,
        (v) => {
            config.outerRadiusCells = Math.max(1, Math.round(v));
        },
        { min: 1 },
    );
    addNumberField(
        donutFields,
        "Donut thickness (cells)",
        () => config.donutThicknessCells,
        (v) => {
            config.donutThicknessCells = Math.max(1, Math.min(config.outerRadiusCells - 1, Math.round(v)));
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    const updateModeVisibility = () => {
        rectFields.hidden = config.boundsMode !== "rect";
        circleFields.hidden = config.boundsMode === "rect";
        donutFields.hidden = config.boundsMode !== "donut";
    };
    modeSelect.addEventListener("change", () => {
        config.boundsMode = /** @type {"rect" | "circle" | "donut"} */ (modeSelect.value);
        migrateMapGenBoundsForMode(config);
        refreshMapGenPanelInputs();
        updateModeVisibility();
        onPreviewChange();
    });
    panel.append(rectFields, circleFields, donutFields);
    updateModeVisibility();
}
/**
 * @param {HTMLElement} panel
 * @param {import("../state.js").TileLabGameState} state
 * @param {() => void} onPreviewChange
 * @param {() => void} onGenerated
 */
export function buildCavernGenEditor(panel, state, onPreviewChange, onGenerated) {
    mapGenBoundInputs = [];
    const { cavernConfig } = state.editor;
    const surfaceSettings = state.worldSurfaces.settings;
    appendMapGenBoundsControls(panel, cavernConfig, state, "Orange overlay on map overview — drag inside to move, drag edges/rings to resize.", onPreviewChange);
    const addSlider = (label, min, max, step, key, format = (v) => String(v)) => {
        panel.appendChild(
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
        void generateLabCaverns(state).then(onGenerated);
    });
    row.append(newSeedBtn, genBtn);
    panel.appendChild(row);
}
/**
 * @param {HTMLElement} panel
 * @param {import("../state.js").TileLabGameState} state
 * @param {() => void} onPreviewChange
 * @param {() => void} onGenerated
 */
export function buildRailGenEditor(panel, state, onPreviewChange, onGenerated) {
    mapGenBoundInputs = [];
    const { railConfig } = state.editor;
    const surfaceSettings = state.worldSurfaces.settings;
    appendMapGenBoundsControls(panel, railConfig, state, "Purple overlay on map overview — drag inside to move, drag edges/rings to resize.", onPreviewChange);
    const addSlider = (label, min, max, step, key, format = (v) => String(v)) => {
        panel.appendChild(
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
    addSlider("Rock density", 0.2, 0.7, 0.05, "fillChance", (v) => `${Math.round(v * 100)}%`);
    addSlider("Smooth passes", 1, 8, 1, "iterations");
    addSlider("Wall height", 1, surfaceSettings.maxWallHeightLevel, 1, "wallHeightLevel");
    addSlider("Wall thickness", 1, 4, 1, "edgeThickness");
    const row = document.createElement("div");
    row.className = "editor-tools-row";
    const genBtn = document.createElement("button");
    genBtn.type = "button";
    genBtn.textContent = "Generate rail walls";
    genBtn.addEventListener("click", () => {
        void generateLabRailCaverns(state).then(onGenerated);
    });
    row.appendChild(genBtn);
    panel.appendChild(row);
}
/**
 * @param {HTMLElement} panel
 * @param {import("../state.js").TileLabGameState} state
 * @param {() => void} onPreviewChange
 * @param {() => void} onGenerated
 */
export function buildEraseEditor(panel, state, onPreviewChange, onGenerated) {
    mapGenBoundInputs = [];
    const { eraseConfig } = state.editor;
    appendMapGenBoundsControls(
        panel,
        eraseConfig,
        state,
        "Red overlay on map overview — drag inside to move, drag edges/rings to resize. Clears voxel walls and rail edges in bounds.",
        onPreviewChange,
    );
    const row = document.createElement("div");
    row.className = "editor-tools-row";
    const eraseBtn = document.createElement("button");
    eraseBtn.type = "button";
    eraseBtn.textContent = "Erase walls in bounds";
    eraseBtn.addEventListener("click", () => {
        void eraseLabWallsInBounds(state).then(onGenerated);
    });
    row.appendChild(eraseBtn);
    panel.appendChild(row);
}
/** @param {import("../state.js").TileLabGameState} state @param {"cavern" | "rail" | "erase"} kind @param {() => void} onGenerated */
export function appendMapGenEditor(parent, state, kind, onGenerated) {
    const onPreviewChange = () => paintMapOverviewFrame(state);
    if (kind === "cavern") buildCavernGenEditor(parent, state, onPreviewChange, onGenerated);
    else if (kind === "rail") buildRailGenEditor(parent, state, onPreviewChange, onGenerated);
    else buildEraseEditor(parent, state, onPreviewChange, onGenerated);
}
