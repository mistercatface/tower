import { gridSettings } from "../../Config/world.js";
import { migrateMapGenBoundsForMode, syncMapGenBoundsFromPlay } from "./mapGenBounds.js";
import { appendActionRow, appendEditorHint, appendSelectField } from "../UI/paramFields.js";
import { setFormFieldName } from "../UI/Component.js";
import { SliderControl } from "../UI/controls/SliderControl.js";
import { shippedSurfaceProfileIds } from "../../Config/procedural/profiles.js";
const BOUNDS_SHAPE_OPTIONS = [
    { value: "rect", label: "Rectangle" },
    { value: "circle", label: "Circle" },
    { value: "donut", label: "Donut" },
];
const mapGenBoundInputs = [];
export function refreshMapGenPanelInputs() {
    for (let i = 0; i < mapGenBoundInputs.length; i++) mapGenBoundInputs[i].input.value = String(mapGenBoundInputs[i].getValue());
}
function appendSyncedNumberField(panel, label, getValue, setValue, onPreviewChange, options) {
    const { step = 1, min = -999999 } = options ?? {};
    const field = document.createElement("label");
    field.className = "param-field";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    setFormFieldName(input, label);
    input.step = String(step);
    input.min = String(min);
    input.value = String(getValue());
    field.append(labelSpan, input);
    panel.appendChild(field);
    input.addEventListener("change", () => {
        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) {
            input.value = String(getValue());
            return;
        }
        setValue(parsed);
        input.value = String(getValue());
        onPreviewChange();
    });
    mapGenBoundInputs.push({ input, getValue });
}
function appendMapGenBoundsControls(panel, config, state, overlayHint, onPreviewChange) {
    const { playConfig } = state.editor;
    appendEditorHint(panel, overlayHint);
    const rectFields = document.createElement("div");
    const circleFields = document.createElement("div");
    const donutFields = document.createElement("div");
    const updateModeVisibility = () => {
        rectFields.hidden = config.boundsMode !== "rect";
        circleFields.hidden = config.boundsMode === "rect";
        donutFields.hidden = config.boundsMode !== "donut";
    };
    appendSelectField(panel, "Bounds shape", {
        value: config.boundsMode,
        options: BOUNDS_SHAPE_OPTIONS,
        onChange: (value) => {
            config.boundsMode = value;
            migrateMapGenBoundsForMode(state.obstacleGrid, config);
            refreshMapGenPanelInputs();
            updateModeVisibility();
            onPreviewChange();
        },
    });
    appendActionRow(
        panel,
        [
            {
                label: "Center bounds on camera",
                onClick: () => {
                    syncMapGenBoundsFromPlay(state.obstacleGrid, state.viewport, playConfig, config, gridSettings.cellSize);
                    migrateMapGenBoundsForMode(state.obstacleGrid, config);
                    refreshMapGenPanelInputs();
                    onPreviewChange();
                },
            },
        ],
        { className: "editor-tools-row" },
    );
    const setBound = (setter) => (v) => {
        setter(v);
        migrateMapGenBoundsForMode(state.obstacleGrid, config);
    };
    const addBound = (parent, label, get, set, opts) => appendSyncedNumberField(parent, label, get, setBound(set), onPreviewChange, opts);
    addBound(
        rectFields,
        "Bounds col",
        () => config.boundsIdx % state.obstacleGrid.cols,
        (v) => {
            const r = (config.boundsIdx / state.obstacleGrid.cols) | 0;
            config.boundsIdx = state.obstacleGrid.idx(Math.round(v), r);
        },
    );
    addBound(
        rectFields,
        "Bounds row",
        () => (config.boundsIdx / state.obstacleGrid.cols) | 0,
        (v) => {
            const c = config.boundsIdx % state.obstacleGrid.cols;
            config.boundsIdx = state.obstacleGrid.idx(c, Math.round(v));
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
        () => config.centerIdx % state.obstacleGrid.cols,
        (v) => {
            const r = (config.centerIdx / state.obstacleGrid.cols) | 0;
            config.centerIdx = state.obstacleGrid.idx(Math.round(v), r);
        },
    );
    addBound(
        circleFields,
        "Center row",
        () => (config.centerIdx / state.obstacleGrid.cols) | 0,
        (v) => {
            const c = config.centerIdx % state.obstacleGrid.cols;
            config.centerIdx = state.obstacleGrid.idx(c, Math.round(v));
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
    appendSyncedNumberField(
        donutFields,
        "Donut thickness (cells)",
        () => config.donutThicknessCells,
        (v) => {
            config.donutThicknessCells = Math.max(1, Math.min(config.outerRadiusCells - 1, Math.round(v)));
        },
        onPreviewChange,
        { min: 1 },
    );
    panel.append(rectFields, circleFields, donutFields);
    updateModeVisibility();
}
function appendMapGenRockSliders(panel, config, maxWallHeightLevel) {
    const addSlider = (label, min, max, step, key, format = (v) => String(v)) => {
        panel.appendChild(
            new SliderControl(
                label,
                min,
                max,
                step,
                config[key],
                (val) => {
                    config[key] = val;
                },
                format,
            ).element,
        );
    };
    addSlider("Rock density", 0.2, 0.7, 0.05, "fillChance", (v) => `${Math.round(v * 100)}%`);
    addSlider("Smooth passes", 1, 8, 1, "iterations");
    addSlider("Wall height", 1, maxWallHeightLevel, 1, "wallHeightLevel");
}
function buildCavernGenEditor(panel, state, onPreviewChange, onGenerated, generateCaverns) {
    mapGenBoundInputs.length = 0;
    const { cavernConfig } = state.editor;
    const maxWallHeightLevel = state.worldSurfaces.settings.maxWallHeightLevel;
    appendMapGenBoundsControls(panel, cavernConfig, state, "Orange overlay on map overview — drag inside to move, drag edges/rings to resize.", onPreviewChange);
    const profileOptions = shippedSurfaceProfileIds().map((id) => ({ value: id, label: id }));
    appendSelectField(panel, "Surface profile", {
        value: cavernConfig.surfaceProfileId,
        options: profileOptions,
        onChange: (value) => {
            cavernConfig.surfaceProfileId = value;
            onPreviewChange();
        },
    });
    appendMapGenRockSliders(panel, cavernConfig, maxWallHeightLevel);
    const seedLine = document.createElement("p");
    seedLine.className = "editor-hint";
    seedLine.textContent = `Seed ${state.mapSeed}`;
    panel.appendChild(seedLine);
    appendActionRow(
        panel,
        [
            {
                label: "New seed",
                onClick: () => {
                    state.mapSeed = Math.floor(1 + Math.random() * 1_000_000_000);
                    seedLine.textContent = `Seed ${state.mapSeed}`;
                },
            },
            {
                label: "Generate caverns",
                variant: "",
                onClick: () => {
                    void generateCaverns().then(onGenerated);
                },
            },
        ],
        { className: "editor-tools-row" },
    );
}
function buildRailGenEditor(panel, state, onPreviewChange, onGenerated, generateRails) {
    mapGenBoundInputs.length = 0;
    const { railConfig } = state.editor;
    const maxWallHeightLevel = state.worldSurfaces.settings.maxWallHeightLevel;
    appendMapGenBoundsControls(panel, railConfig, state, "Purple overlay on map overview — drag inside to move, drag edges/rings to resize.", onPreviewChange);
    const profileOptions = shippedSurfaceProfileIds().map((id) => ({ value: id, label: id }));
    appendSelectField(panel, "Surface profile", {
        value: railConfig.surfaceProfileId,
        options: profileOptions,
        onChange: (value) => {
            railConfig.surfaceProfileId = value;
            onPreviewChange();
        },
    });
    appendMapGenRockSliders(panel, railConfig, maxWallHeightLevel);
    panel.appendChild(
        new SliderControl("Wall thickness", 1, 4, 1, railConfig.edgeThickness, (val) => {
            railConfig.edgeThickness = val;
        }).element,
    );
    appendActionRow(
        panel,
        [
            {
                label: "Generate rail walls",
                variant: "",
                onClick: () => {
                    void generateRails().then(onGenerated);
                },
            },
        ],
        { className: "editor-tools-row" },
    );
}
function buildRailMazeGenEditor(panel, state, onPreviewChange, onGenerated, generateRailMaze) {
    mapGenBoundInputs.length = 0;
    const { railMazeConfig } = state.editor;
    const maxWallHeightLevel = state.worldSurfaces.settings.maxWallHeightLevel;
    appendMapGenBoundsControls(panel, railMazeConfig, state, "Light purple overlay on map overview — drag inside to move, drag edges/rings to resize.", onPreviewChange);
    const profileOptions = shippedSurfaceProfileIds().map((id) => ({ value: id, label: id }));
    appendSelectField(panel, "Surface profile", {
        value: railMazeConfig.surfaceProfileId,
        options: profileOptions,
        onChange: (value) => {
            railMazeConfig.surfaceProfileId = value;
            onPreviewChange();
        },
    });
    panel.appendChild(
        new SliderControl("Wall thickness", 1, 4, 1, railMazeConfig.edgeThickness, (val) => {
            railMazeConfig.edgeThickness = val;
        }).element,
    );
    panel.appendChild(
        new SliderControl("Wall height", 1, maxWallHeightLevel, 1, railMazeConfig.wallHeightLevel, (val) => {
            railMazeConfig.wallHeightLevel = val;
        }).element,
    );
    panel.appendChild(
        new SliderControl("Min corridor width", 1, 4, 1, railMazeConfig.corridorWidthMin, (val) => {
            railMazeConfig.corridorWidthMin = val;
            if (railMazeConfig.corridorWidthMax < val) railMazeConfig.corridorWidthMax = val;
        }).element,
    );
    panel.appendChild(
        new SliderControl("Max corridor width", 1, 4, 1, railMazeConfig.corridorWidthMax, (val) => {
            railMazeConfig.corridorWidthMax = Math.max(railMazeConfig.corridorWidthMin, val);
        }).element,
    );
    panel.appendChild(
        new SliderControl(
            "Extra link ratio",
            0,
            1,
            0.05,
            railMazeConfig.extraLinkRatio,
            (val) => {
                railMazeConfig.extraLinkRatio = val;
            },
            (v) => `${Math.round(v * 100)}%`,
        ).element,
    );
    appendActionRow(
        panel,
        [
            {
                label: "Generate rail maze",
                variant: "",
                onClick: () => {
                    void generateRailMaze().then(onGenerated);
                },
            },
        ],
        { className: "editor-tools-row" },
    );
}
function buildEraseEditor(panel, state, onPreviewChange, onGenerated, eraseWalls) {
    mapGenBoundInputs.length = 0;
    const { eraseConfig } = state.editor;
    appendMapGenBoundsControls(
        panel,
        eraseConfig,
        state,
        "Red overlay on map overview — drag inside to move, drag edges/rings to resize. Clears voxel walls and rail edges in bounds.",
        onPreviewChange,
    );
    appendActionRow(
        panel,
        [
            {
                label: "Erase walls in bounds",
                variant: "",
                onClick: () => {
                    void eraseWalls().then(onGenerated);
                },
            },
        ],
        { className: "editor-tools-row" },
    );
}
export function appendMapGenEditor(parent, state, kind, { onGenerated, onPreviewChange, generateCaverns, generateRails, generateRailMaze, eraseWalls }) {
    if (kind === "cavern") buildCavernGenEditor(parent, state, onPreviewChange, onGenerated, generateCaverns);
    else if (kind === "rail") buildRailGenEditor(parent, state, onPreviewChange, onGenerated, generateRails);
    else if (kind === "railMaze") buildRailMazeGenEditor(parent, state, onPreviewChange, onGenerated, generateRailMaze);
    else buildEraseEditor(parent, state, onPreviewChange, onGenerated, eraseWalls);
}
