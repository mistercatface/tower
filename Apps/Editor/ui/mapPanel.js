import { applyPlayAreaConfig, PLAY_AREA_CELL_OPTIONS, playAreaCellsToIndex } from "../world/mapWorld.js";
import { paintMapOverviewFrame } from "./mapOverview.js";
import { SliderControl } from "../../../Libraries/UI/controls/SliderControl.js";
import { appendSectionTitle } from "./mapPanelFields.js";
/** @param {string} label @param {"playAreaCols" | "playAreaRows"} key @param {import("../state.js").TileLabGameState} state @param {() => void} onPreviewChange */
function addPlayAreaSlider(panel, label, key, state, onPreviewChange) {
    const { playConfig } = state.editor;
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
                applyPlayAreaConfig(state);
                onPreviewChange();
            },
            (index) => `${PLAY_AREA_CELL_OPTIONS[index]} cells`,
        ).element,
    );
}
/** @param {import("../state.js").TileLabGameState} state */
export function buildMapPanel(state) {
    const panel = document.getElementById("mapSettingsPanel");
    panel.innerHTML = "";
    const onPreviewChange = () => paintMapOverviewFrame(state);
    applyPlayAreaConfig(state);
    const playSection = document.createElement("div");
    playSection.className = "editor-block";
    appendSectionTitle(playSection, "Play area");
    const playHint = document.createElement("p");
    playHint.className = "editor-hint";
    playHint.textContent = "Obstacle grid size — expands immediately, centered on the camera. Cavern and rail bounds match. Generation settings are in Props.";
    playSection.appendChild(playHint);
    addPlayAreaSlider(playSection, "Play width", "playAreaCols", state, onPreviewChange);
    addPlayAreaSlider(playSection, "Play height", "playAreaRows", state, onPreviewChange);
    panel.appendChild(playSection);
    onPreviewChange();
}
