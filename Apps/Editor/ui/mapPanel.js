import { labCavernConfig, generateLabCaverns, PLAY_AREA_CELL_OPTIONS, playAreaCellsToIndex } from "../world/mapWorld.js";
import { SliderControl } from "./controls/SliderControl.js";
/** @param {string} label @param {"playAreaCols" | "playAreaRows"} key */
function addPlayAreaSlider(panel, label, key) {
    const maxIndex = PLAY_AREA_CELL_OPTIONS.length - 1;
    panel.appendChild(
        new SliderControl(
            label,
            0,
            maxIndex,
            1,
            playAreaCellsToIndex(labCavernConfig[key]),
            (index) => {
                labCavernConfig[key] = PLAY_AREA_CELL_OPTIONS[index];
            },
            (index) => `${PLAY_AREA_CELL_OPTIONS[index]} cells`,
        ).element,
    );
}
/** @param {import("../state.js").TileLabGameState} state @param {() => void} onGenerated */
export function buildMapPanel(state, onGenerated) {
    const panel = document.getElementById("mapSettingsPanel");
    panel.innerHTML = "";
    const addSlider = (label, min, max, step, key, format = (v) => String(v)) => {
        panel.appendChild(
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
    addPlayAreaSlider(panel, "Play width", "playAreaCols");
    addPlayAreaSlider(panel, "Play height", "playAreaRows");
    addSlider("Rock density", 0.2, 0.7, 0.05, "fillChance", (v) => `${Math.round(v * 100)}%`);
    addSlider("Smooth passes", 1, 8, 1, "iterations");
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
