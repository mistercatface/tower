import { labPlayConfig, labCavernConfig, generateLabCaverns, PLAY_AREA_CELL_OPTIONS, playAreaCellsToIndex, syncCavernBoundsFromPlay, syncCavernBoundsSizeFromPlay } from "../world/mapWorld.js";
import { paintMapOverviewFrame } from "./mapOverview.js";
import { SliderControl } from "./controls/SliderControl.js";
/** @param {import("../state.js").TileLabGameState} state */
function refreshGenPreview(state) {
    paintMapOverviewFrame(state);
}
/** @param {HTMLElement} panel @param {string} title */
function appendSectionTitle(panel, title) {
    const heading = document.createElement("div");
    heading.className = "editor-block-title";
    heading.textContent = title;
    panel.appendChild(heading);
}
/** @param {string} label @param {"playAreaCols" | "playAreaRows"} key @param {() => void} onPreviewChange @param {() => void} refreshBoundInputs */
function addPlayAreaSlider(panel, label, key, onPreviewChange, refreshBoundInputs) {
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
                syncCavernBoundsSizeFromPlay(labPlayConfig, labCavernConfig);
                refreshBoundInputs();
                onPreviewChange();
            },
            (index) => `${PLAY_AREA_CELL_OPTIONS[index]} cells`,
        ).element,
    );
}
/**
 * @param {HTMLElement} panel
 * @param {string} label
 * @param {() => number} getValue
 * @param {(value: number) => void} setValue
 * @param {{ step?: number, min?: number }} [options]
 * @param {() => void} onPreviewChange
 * @param {{ input: HTMLInputElement, getValue: () => number }[]} boundInputs
 */
function addNumberField(panel, label, getValue, setValue, options, onPreviewChange, boundInputs) {
    const { step = 1, min = -999999 } = options ?? {};
    const field = document.createElement("label");
    field.className = "param-field";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
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
    boundInputs.push({ input, getValue });
}
/** @param {import("../state.js").TileLabGameState} state @param {() => void} onGenerated */
export function buildMapPanel(state, onGenerated) {
    const panel = document.getElementById("mapSettingsPanel");
    panel.innerHTML = "";
    const onPreviewChange = () => refreshGenPreview(state);
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
    addPlayAreaSlider(playSection, "Play width", "playAreaCols", onPreviewChange, refreshBoundInputs);
    addPlayAreaSlider(playSection, "Play height", "playAreaRows", onPreviewChange, refreshBoundInputs);
    panel.appendChild(playSection);
    const cavernSection = document.createElement("div");
    cavernSection.className = "editor-block";
    appendSectionTitle(cavernSection, "Cavern generation");
    const cavernHint = document.createElement("p");
    cavernHint.className = "editor-hint";
    cavernHint.textContent = "Bounds in grid cells. Move the orange box and generate again to stamp additional caverns.";
    cavernSection.appendChild(cavernHint);
    const syncRow = document.createElement("div");
    syncRow.className = "editor-tools-row";
    const syncBtn = document.createElement("button");
    syncBtn.type = "button";
    syncBtn.className = "secondary";
    syncBtn.textContent = "Center bounds on camera";
    syncBtn.addEventListener("click", () => {
        syncCavernBoundsFromPlay(state.viewport, labPlayConfig, labCavernConfig);
        refreshBoundInputs();
        onPreviewChange();
    });
    syncRow.appendChild(syncBtn);
    cavernSection.appendChild(syncRow);
    addNumberField(
        cavernSection,
        "Bounds col",
        () => labCavernConfig.boundsCol,
        (v) => {
            labCavernConfig.boundsCol = Math.round(v);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        cavernSection,
        "Bounds row",
        () => labCavernConfig.boundsRow,
        (v) => {
            labCavernConfig.boundsRow = Math.round(v);
        },
        undefined,
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        cavernSection,
        "Bounds cols",
        () => labCavernConfig.boundsCols,
        (v) => {
            labCavernConfig.boundsCols = Math.max(1, Math.round(v));
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
    addNumberField(
        cavernSection,
        "Bounds rows",
        () => labCavernConfig.boundsRows,
        (v) => {
            labCavernConfig.boundsRows = Math.max(1, Math.round(v));
        },
        { min: 1 },
        onPreviewChange,
        boundInputs,
    );
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
    onPreviewChange();
}
