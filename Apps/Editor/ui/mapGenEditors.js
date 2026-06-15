import { migrateCavernConfigForMode } from "../world/cavernBounds.js";
import { applyPlayAreaConfig, eraseLabWallsInBounds, generateLabCaverns, generateLabRailCaverns, syncCavernBoundsFromPlay } from "../world/mapWorld.js";
import { paintMapOverviewFrame } from "./mapOverview.js";
import { SliderControl } from "../../../Libraries/UI/controls/SliderControl.js";
import { addNumberField } from "./mapPanelFields.js";
/** @type {{ input: HTMLInputElement, getValue: () => number }[]} */
let mapGenBoundInputs = [];
export function refreshMapGenPanelInputs() {
    for (let i = 0; i < mapGenBoundInputs.length; i++) mapGenBoundInputs[i].input.value = String(mapGenBoundInputs[i].getValue());
}
/**
 * @param {HTMLElement} panel
 * @param {import("../state.js").TileLabGameState} state
 * @param {() => void} onPreviewChange
 * @param {() => void} onGenerated
 */
export function buildCavernGenEditor(panel, state, onPreviewChange, onGenerated) {
    mapGenBoundInputs = [];
    const { playConfig, cavernConfig } = state.editor;
    const surfaceSettings = state.worldSurfaces.settings;
    const boundInputs = mapGenBoundInputs;
    const refreshBoundInputs = refreshMapGenPanelInputs;
    appendEditorHint(panel, "Orange overlay on map overview — drag inside to move, drag edges/rings to resize.");
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
        syncCavernBoundsFromPlay(state.viewport, playConfig, cavernConfig);
        migrateCavernConfigForMode(cavernConfig);
        refreshBoundInputs();
        onPreviewChange();
    });
    syncRow.appendChild(syncBtn);
    panel.appendChild(syncRow);
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
    panel.append(rectFields, circleFields, donutFields);
    updateModeVisibility();
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
        generateLabCaverns(state);
        onGenerated();
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
    const { playConfig, railConfig } = state.editor;
    const surfaceSettings = state.worldSurfaces.settings;
    const boundInputs = mapGenBoundInputs;
    const refreshBoundInputs = refreshMapGenPanelInputs;
    appendEditorHint(panel, "Purple overlay on map overview — drag inside to move, drag edges/rings to resize.");
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
    modeSelect.value = railConfig.boundsMode;
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
        syncCavernBoundsFromPlay(state.viewport, playConfig, railConfig);
        migrateCavernConfigForMode(railConfig);
        refreshBoundInputs();
        onPreviewChange();
    });
    syncRow.appendChild(syncBtn);
    panel.appendChild(syncRow);
    addNumberField(
        rectFields,
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
        rectFields,
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
        rectFields,
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
        rectFields,
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
        circleFields,
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
        circleFields,
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
        circleFields,
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
        donutFields,
        "Donut thickness (cells)",
        () => railConfig.donutThicknessCells,
        (v) => {
            railConfig.donutThicknessCells = Math.max(1, Math.min(railConfig.outerRadiusCells - 1, Math.round(v)));
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    const updateModeVisibility = () => {
        rectFields.hidden = railConfig.boundsMode !== "rect";
        circleFields.hidden = railConfig.boundsMode === "rect";
        donutFields.hidden = railConfig.boundsMode !== "donut";
    };
    modeSelect.addEventListener("change", () => {
        railConfig.boundsMode = /** @type {"rect" | "circle" | "donut"} */ (modeSelect.value);
        migrateCavernConfigForMode(railConfig);
        refreshBoundInputs();
        updateModeVisibility();
        onPreviewChange();
    });
    panel.append(rectFields, circleFields, donutFields);
    updateModeVisibility();
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
        generateLabRailCaverns(state);
        onGenerated();
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
    const { playConfig, eraseConfig } = state.editor;
    const boundInputs = mapGenBoundInputs;
    const refreshBoundInputs = refreshMapGenPanelInputs;
    appendEditorHint(panel, "Red overlay on map overview — drag inside to move, drag edges/rings to resize. Clears voxel walls and rail edges in bounds.");
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
    modeSelect.value = eraseConfig.boundsMode;
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
        syncCavernBoundsFromPlay(state.viewport, playConfig, eraseConfig);
        migrateCavernConfigForMode(eraseConfig);
        refreshBoundInputs();
        onPreviewChange();
    });
    syncRow.appendChild(syncBtn);
    panel.appendChild(syncRow);
    const addBound = (parent, label, get, set, opts) =>
        addNumberField(parent, label, get, set, opts, onPreviewChange, boundInputs);
    addBound(rectFields, "Bounds col", () => eraseConfig.boundsCol, (v) => { eraseConfig.boundsCol = Math.round(v); migrateCavernConfigForMode(eraseConfig); });
    addBound(rectFields, "Bounds row", () => eraseConfig.boundsRow, (v) => { eraseConfig.boundsRow = Math.round(v); migrateCavernConfigForMode(eraseConfig); });
    addBound(rectFields, "Bounds cols", () => eraseConfig.boundsCols, (v) => { eraseConfig.boundsCols = Math.max(1, Math.round(v)); migrateCavernConfigForMode(eraseConfig); }, { min: 1 });
    addBound(rectFields, "Bounds rows", () => eraseConfig.boundsRows, (v) => { eraseConfig.boundsRows = Math.max(1, Math.round(v)); migrateCavernConfigForMode(eraseConfig); }, { min: 1 });
    addBound(circleFields, "Center col", () => eraseConfig.centerCol, (v) => { eraseConfig.centerCol = Math.round(v); migrateCavernConfigForMode(eraseConfig); });
    addBound(circleFields, "Center row", () => eraseConfig.centerRow, (v) => { eraseConfig.centerRow = Math.round(v); migrateCavernConfigForMode(eraseConfig); });
    addBound(circleFields, "Radius (cells)", () => eraseConfig.outerRadiusCells, (v) => { eraseConfig.outerRadiusCells = Math.max(1, Math.round(v)); migrateCavernConfigForMode(eraseConfig); }, { min: 1 });
    addBound(donutFields, "Donut thickness (cells)", () => eraseConfig.donutThicknessCells, (v) => { eraseConfig.donutThicknessCells = Math.max(1, Math.min(eraseConfig.outerRadiusCells - 1, Math.round(v))); }, { min: 1 });
    const updateModeVisibility = () => {
        rectFields.hidden = eraseConfig.boundsMode !== "rect";
        circleFields.hidden = eraseConfig.boundsMode === "rect";
        donutFields.hidden = eraseConfig.boundsMode !== "donut";
    };
    modeSelect.addEventListener("change", () => {
        eraseConfig.boundsMode = /** @type {"rect" | "circle" | "donut"} */ (modeSelect.value);
        migrateCavernConfigForMode(eraseConfig);
        refreshBoundInputs();
        updateModeVisibility();
        onPreviewChange();
    });
    panel.append(rectFields, circleFields, donutFields);
    updateModeVisibility();
    const row = document.createElement("div");
    row.className = "editor-tools-row";
    const eraseBtn = document.createElement("button");
    eraseBtn.type = "button";
    eraseBtn.textContent = "Erase walls in bounds";
    eraseBtn.addEventListener("click", () => {
        eraseLabWallsInBounds(state);
        onGenerated();
    });
    row.appendChild(eraseBtn);
    panel.appendChild(row);
}
/** @param {HTMLElement} parent @param {string} text */
function appendEditorHint(parent, text) {
    const hint = document.createElement("p");
    hint.className = "editor-hint";
    hint.textContent = text;
    parent.appendChild(hint);
}
/** @param {import("../state.js").TileLabGameState} state @param {"cavern" | "rail" | "erase"} kind @param {() => void} onGenerated */
export function appendMapGenEditor(parent, state, kind, onGenerated) {
    const onPreviewChange = () => paintMapOverviewFrame(state);
    if (kind === "cavern") buildCavernGenEditor(parent, state, onPreviewChange, onGenerated);
    else if (kind === "rail") buildRailGenEditor(parent, state, onPreviewChange, onGenerated);
    else buildEraseEditor(parent, state, onPreviewChange, onGenerated);
}
