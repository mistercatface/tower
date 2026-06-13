import { gridSettings } from "../../../Config/Config.js";
import { centerCellBoundsOnViewport } from "../world/cellBoundsConfig.js";
import { deleteStaticWallsInBounds, stampStaticWallsInBounds, stampWallEdgesInBounds } from "../world/staticGridWallEdit.js";
import { buildRectCircleBoundsFields } from "./cellBoundsFields.js";
import { appendSectionTitle, addNumberField } from "./mapPanelFields.js";
import { SliderControl } from "./controls/SliderControl.js";
const EDGE_SIDE_OPTIONS = [
    { value: 0, label: "North (+Y)" },
    { value: 1, label: "East (+X)" },
    { value: 2, label: "South (-Y)" },
    { value: 3, label: "West (-X)" },
];
/** @param {import("../state.js").TileLabGameState} state @param {HTMLElement} mount @param {() => void} onChanged */
export function buildMapWallToolPanel(state, mount, onChanged) {
    const config = state.editor.wallToolConfig;
    const surfaceSettings = state.worldSurfaces.settings;
    mount.innerHTML = "";
    const onPreviewChange = () => onChanged();
    /** @type {{ input: HTMLInputElement, getValue: () => number }[]} */
    const boundInputs = [];
    const refreshBoundInputs = () => {
        for (let i = 0; i < boundInputs.length; i++) boundInputs[i].input.value = String(boundInputs[i].getValue());
    };
    appendSectionTitle(mount, "Wall tools");
    const hint = document.createElement("p");
    hint.className = "editor-hint";
    hint.textContent =
        "Red overlay on map overview — drag to move/resize. Solid fills the selection with blocked cells. Edge line stamps one thin wall on the chosen side of every cell in the selection (interior stays walkable).";
    mount.appendChild(hint);
    const previewLabel = document.createElement("label");
    previewLabel.className = "check-inline editor-map-preview-toggle";
    const previewInput = document.createElement("input");
    previewInput.type = "checkbox";
    previewInput.checked = state.editor.showMapOverviewWallBounds;
    previewInput.addEventListener("change", () => {
        state.editor.showMapOverviewWallBounds = previewInput.checked;
        onPreviewChange();
    });
    previewLabel.append(previewInput, document.createTextNode(" Show on map overview"));
    mount.appendChild(previewLabel);
    buildRectCircleBoundsFields(mount, config, { onPreviewChange, refreshBoundInputs, boundInputs, addNumberField });
    const syncRow = document.createElement("div");
    syncRow.className = "editor-tools-row";
    const syncBtn = document.createElement("button");
    syncBtn.type = "button";
    syncBtn.className = "secondary";
    syncBtn.textContent = "Center bounds on camera";
    syncBtn.addEventListener("click", () => {
        centerCellBoundsOnViewport(state.viewport, config, gridSettings.cellSize);
        refreshBoundInputs();
        onPreviewChange();
    });
    syncRow.appendChild(syncBtn);
    mount.appendChild(syncRow);
    const modeRow = document.createElement("div");
    modeRow.className = "editor-tools-row";
    const modeLabel = document.createElement("label");
    modeLabel.textContent = "Stamp mode";
    const modeSelect = document.createElement("select");
    modeSelect.innerHTML = `
        <option value="fill">Solid cells (voxel block)</option>
        <option value="edgeLine">Edge line (single thin wall)</option>
    `;
    modeSelect.value = config.wallStampMode ?? "fill";
    modeSelect.addEventListener("change", () => {
        config.wallStampMode = modeSelect.value;
        edgeSideRow.hidden = config.wallStampMode !== "edgeLine";
        thicknessRow.hidden = config.wallStampMode !== "edgeLine";
    });
    modeRow.append(modeLabel, modeSelect);
    mount.appendChild(modeRow);
    const edgeSideRow = document.createElement("div");
    edgeSideRow.className = "editor-tools-row";
    edgeSideRow.hidden = (config.wallStampMode ?? "fill") !== "edgeLine";
    const edgeSideLabel = document.createElement("label");
    edgeSideLabel.textContent = "Wall side";
    const edgeSideSelect = document.createElement("select");
    for (let i = 0; i < EDGE_SIDE_OPTIONS.length; i++) {
        const opt = document.createElement("option");
        opt.value = String(EDGE_SIDE_OPTIONS[i].value);
        opt.textContent = EDGE_SIDE_OPTIONS[i].label;
        edgeSideSelect.appendChild(opt);
    }
    edgeSideSelect.value = String(config.edgeLineSide ?? 2);
    edgeSideSelect.addEventListener("change", () => {
        config.edgeLineSide = Number(edgeSideSelect.value);
    });
    edgeSideRow.append(edgeSideLabel, edgeSideSelect);
    mount.appendChild(edgeSideRow);
    mount.appendChild(
        new SliderControl("Wall height", 1, surfaceSettings.maxWallHeightLevel, 1, config.wallHeightLevel, (val) => {
            config.wallHeightLevel = val;
        }).element,
    );
    const thicknessRow = document.createElement("div");
    thicknessRow.hidden = (config.wallStampMode ?? "fill") !== "edgeLine";
    thicknessRow.appendChild(
        new SliderControl("Edge thickness", 1, 8, 1, config.edgeThickness ?? 2, (val) => {
            config.edgeThickness = val;
        }).element,
    );
    mount.appendChild(thicknessRow);
    const row = document.createElement("div");
    row.className = "editor-tools-row";
    const stampBtn = document.createElement("button");
    stampBtn.type = "button";
    stampBtn.textContent = "Stamp";
    stampBtn.addEventListener("click", () => {
        if ((config.wallStampMode ?? "fill") === "edgeLine") stampWallEdgesInBounds(state, config, config.edgeLineSide ?? 2, config.wallHeightLevel, config.edgeThickness ?? 2);
        else stampStaticWallsInBounds(state, config, config.wallHeightLevel);
        onChanged();
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
        deleteStaticWallsInBounds(state, config);
        onChanged();
    });
    row.append(stampBtn, deleteBtn);
    mount.appendChild(row);
    return { refreshBoundInputs };
}
