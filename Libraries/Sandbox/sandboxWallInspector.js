import { CORRIDOR_AUTHORING_TYPE_OPTIONS } from "../RoomGraph/roomGraphCorridorTypes.js";
import { formatGridWallEdgeSideLabel } from "./gridWallEdit.js";
import { appendEditorHint, appendNumberField, appendSelectField } from "../UI/paramFields.js";
import { SliderControl } from "../UI/controls/SliderControl.js";

const PASSAGE_MODE_OPTIONS = [
    { value: "solid", label: "Solid — wall when powered" },
    { value: "oneWay", label: "One-way — block against allowed side" },
    { value: "tripwire", label: "Tripwire — sensor, never blocks" },
];

const EDGE_SIDE_OPTIONS = [
    { value: "0", label: formatGridWallEdgeSideLabel(0) },
    { value: "1", label: formatGridWallEdgeSideLabel(1) },
    { value: "2", label: formatGridWallEdgeSideLabel(2) },
    { value: "3", label: formatGridWallEdgeSideLabel(3) },
];

function maxWallHeightLevel(controller) {
    return controller.getState().worldSurfaces.settings.maxWallHeightLevel;
}

function appendWallDeleteRow(body, label, onDelete) {
    const deleteRow = document.createElement("div");
    deleteRow.className = "sandbox-add-row";
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary";
    deleteBtn.textContent = label;
    deleteBtn.addEventListener("click", onDelete);
    deleteRow.appendChild(deleteBtn);
    body.appendChild(deleteRow);
}

export function appendPassageEditorFields(body, controller, selected, { stampDefaults = false } = {}) {
    const mode = stampDefaults ? controller.getForcefieldStampMode() : selected.mode;
    appendSelectField(body, "Mode", {
        value: mode,
        options: PASSAGE_MODE_OPTIONS,
        onChange: (value) => {
            if (stampDefaults) controller.setForcefieldStampMode(value);
            else controller.setSelectedForcefieldMode(value);
        },
    });
    if (mode === "oneWay" && !stampDefaults && selected)
        appendSelectField(body, "Allowed side", {
            value: String(selected.allowedSide ?? selected.side),
            options: EDGE_SIDE_OPTIONS,
            onChange: (value) => {
                controller.setSelectedForcefieldAllowedSide(Number(value));
            },
        });
}

export function appendForcefieldSelectedInspector(body, controller, selectedForcefieldInfo, { promptReselect = false } = {}) {
    appendEditorHint(
        body,
        promptReselect
            ? `${selectedForcefieldInfo.modeLabel} · ${selectedForcefieldInfo.sideLabel}. Click a laser edge on the map to re-select.`
            : `${selectedForcefieldInfo.modeLabel} forcefield · ${selectedForcefieldInfo.sideLabel}. Arms when connected to an energized power source.`,
    );
    appendPassageEditorFields(body, controller, selectedForcefieldInfo);
    appendWallDeleteRow(body, "Delete forcefield", () => {
        controller.deleteSelectedWall();
    });
}

export function appendRoomLinkCorridorInspector(body, selectedRoomLink, controller) {
    const limitHint = selectedRoomLink.maxCorridorWidth != null ? ` Max width for this wall pair: ${selectedRoomLink.maxCorridorWidth}.` : "";
    appendEditorHint(body, `${selectedRoomLink.label}. Change type or width, then Reroll to regenerate the path.${limitHint}`);
    appendSelectField(body, "Type", {
        value: selectedRoomLink.corridorType,
        options: CORRIDOR_AUTHORING_TYPE_OPTIONS,
        onChange: (value) => {
            controller.updateSelectedRoomLink({ corridorType: value });
        },
    });
    appendNumberField(body, "Width", {
        value: selectedRoomLink.corridorWidthMin ?? 1,
        step: 1,
        min: 1,
        max: selectedRoomLink.maxCorridorWidth ?? 1,
        onChange: (width) => {
            controller.updateSelectedRoomLink({ corridorWidthMin: width, corridorWidthMax: width });
        },
    });
    const actionRow = document.createElement("div");
    actionRow.className = "sandbox-add-row";
    const rerollBtn = document.createElement("button");
    rerollBtn.type = "button";
    rerollBtn.className = "secondary";
    rerollBtn.textContent = "Reroll corridor";
    rerollBtn.addEventListener("click", () => {
        controller.rerollSelectedRoomLink();
    });
    actionRow.appendChild(rerollBtn);
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary";
    deleteBtn.textContent = "Delete link";
    deleteBtn.addEventListener("click", () => {
        controller.deleteSelectedRoomLink();
    });
    actionRow.appendChild(deleteBtn);
    body.appendChild(actionRow);
}

export function appendWallPlaceParams(body, controller, ctx) {
    const { wallStampMode, selectedVoxelInfo, selectedRailInfo } = ctx;
    appendEditorHint(body, "Click the map to place or select walls. Right-click to delete under the cursor.");
    const addRow = document.createElement("div");
    addRow.className = "sandbox-add-row";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "secondary";
    addBtn.textContent = "Add at camera";
    addBtn.addEventListener("click", () => controller.stampWallAtCameraOrigin());
    addRow.appendChild(addBtn);
    body.appendChild(addRow);
    if (wallStampMode !== "forcefield") {
        const maxHeight = maxWallHeightLevel(controller);
        body.appendChild(
            new SliderControl("Height", 1, maxHeight, 1, controller.getWallHeightLevel(), (val) => {
                controller.setWallHeightLevel(val);
                if (selectedVoxelInfo) controller.setSelectedVoxelWallHeight(val);
                else if (selectedRailInfo) controller.setSelectedRailWallProps(val, selectedRailInfo.thicknessLevel);
            }).element,
        );
    }
    if (wallStampMode === "rail")
        body.appendChild(
            new SliderControl("Thickness", 1, 8, 1, controller.getRailThicknessLevel(), (val) => {
                controller.setRailThicknessLevel(val);
                if (selectedRailInfo) controller.setSelectedRailWallProps(selectedRailInfo.heightLevel, val);
            }).element,
        );
    if (wallStampMode === "forcefield") appendPassageEditorFields(body, controller, null, { stampDefaults: true });
}

export function appendWallSelectedInspector(body, controller, ctx) {
    const { selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo } = ctx;
    if (selectedVoxelInfo) {
        appendEditorHint(body, `Voxel block · height ${selectedVoxelInfo.heightLevel}. Change height below or delete.`);
        body.appendChild(
            new SliderControl("Height", 1, maxWallHeightLevel(controller), 1, selectedVoxelInfo.heightLevel, (val) => {
                controller.setSelectedVoxelWallHeight(val);
            }).element,
        );
        appendWallDeleteRow(body, "Delete voxel", () => {
            controller.deleteSelectedWall();
        });
        return true;
    }
    if (selectedRailInfo) {
        appendEditorHint(body, `Rail wall · ${selectedRailInfo.sideLabel} · height ${selectedRailInfo.heightLevel}.`);
        appendSelectField(body, "Side", {
            value: String(selectedRailInfo.side),
            options: [0, 1, 2, 3].map((side) => ({ value: String(side), label: formatGridWallEdgeSideLabel(side) })),
            onChange: (value) => {
                controller.setSelectedRailWallSide(Number(value));
            },
        });
        body.appendChild(
            new SliderControl("Height", 1, maxWallHeightLevel(controller), 1, selectedRailInfo.heightLevel, (val) => {
                controller.setSelectedRailWallProps(val, selectedRailInfo.thicknessLevel);
            }).element,
        );
        body.appendChild(
            new SliderControl("Thickness", 1, 8, 1, selectedRailInfo.thicknessLevel, (val) => {
                controller.setSelectedRailWallProps(selectedRailInfo.heightLevel, val);
            }).element,
        );
        appendWallDeleteRow(body, "Delete rail", () => {
            controller.deleteSelectedWall();
        });
        return true;
    }
    if (selectedForcefieldInfo && controller.isWallPlaceMode()) {
        appendForcefieldSelectedInspector(body, controller, selectedForcefieldInfo);
        return true;
    }
    return false;
}
