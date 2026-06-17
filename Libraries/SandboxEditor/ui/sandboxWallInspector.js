import { resolveRailWallHeightLevel, resolveRailWallThicknessLevel, MAX_RAIL_WALL_THICKNESS_LEVEL } from "../../RoomGraph/roomGraphClosedRooms.js";
import { CORRIDOR_AUTHORING_TYPE_OPTIONS } from "../../RoomGraph/roomGraphCorridorTypes.js";
import { appendSurfaceProfileField } from "../../RoomGraph/roomGraphSurfaceProfile.js";
import { formatGridWallEdgeSideLabel } from "../../Sandbox/gridWallEdit.js";
import { appendActionRow, appendEditorHint, appendNumberField, appendSelectField } from "../../UI/paramFields.js";
import { SliderControl } from "../../UI/controls/SliderControl.js";
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
function maxWallHeightLevel(state) {
    return state.worldSurfaces.settings.maxWallHeightLevel;
}
export function appendRailWallHeightSlider(body, state, heightLevel, onChange) {
    body.appendChild(new SliderControl("Rail height", 1, maxWallHeightLevel(state), 1, heightLevel, onChange).element);
}
export function appendRailWallThicknessSlider(body, controller, thicknessLevel, onChange) {
    body.appendChild(new SliderControl("Rail thickness", 1, MAX_RAIL_WALL_THICKNESS_LEVEL, 1, thicknessLevel, onChange).element);
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
    appendActionRow(body, [{ label: "Delete forcefield", onClick: () => controller.deleteSelectedWall() }]);
}
export function appendRoomLinkCorridorInspector(body, state, selectedRoomLink, controller) {
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
    appendSurfaceProfileField(body, "Floor profile", selectedRoomLink.surfaceProfileId, (profileId) => {
        controller.updateSelectedRoomLink({ surfaceProfileId: profileId });
    });
    appendRailWallHeightSlider(body, state, resolveRailWallHeightLevel(selectedRoomLink.railWallHeightLevel), (val) => {
        controller.updateSelectedRoomLink({ railWallHeightLevel: val });
    });
    appendRailWallThicknessSlider(body, controller, resolveRailWallThicknessLevel(selectedRoomLink.railWallThicknessLevel), (val) => {
        controller.updateSelectedRoomLink({ railWallThicknessLevel: val });
    });
    appendActionRow(body, [
        { label: "Reroll corridor", onClick: () => controller.rerollSelectedRoomLink() },
        { label: "Delete link", onClick: () => controller.deleteSelectedRoomLink() },
    ]);
}
export function appendWallPlaceParams(body, state, controller, ctx) {
    const { wallStampMode, selectedVoxelInfo, selectedRailInfo } = ctx;
    appendEditorHint(body, "Click the map to place or select walls. Right-click to delete under the cursor.");
    appendActionRow(body, [{ label: "Add at camera", onClick: () => controller.stampWallAtCameraOrigin() }]);
    if (wallStampMode !== "forcefield") {
        const maxHeight = maxWallHeightLevel(state);
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
export function appendWallSelectedInspector(body, state, controller, ctx) {
    const { selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo } = ctx;
    if (selectedVoxelInfo) {
        appendEditorHint(body, `Voxel block · height ${selectedVoxelInfo.heightLevel}. Change height below or delete.`);
        body.appendChild(
            new SliderControl("Height", 1, maxWallHeightLevel(state), 1, selectedVoxelInfo.heightLevel, (val) => {
                controller.setSelectedVoxelWallHeight(val);
            }).element,
        );
        appendActionRow(body, [{ label: "Delete voxel", onClick: () => controller.deleteSelectedWall() }]);
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
            new SliderControl("Height", 1, maxWallHeightLevel(state), 1, selectedRailInfo.heightLevel, (val) => {
                controller.setSelectedRailWallProps(val, selectedRailInfo.thicknessLevel);
            }).element,
        );
        body.appendChild(
            new SliderControl("Thickness", 1, 8, 1, selectedRailInfo.thicknessLevel, (val) => {
                controller.setSelectedRailWallProps(selectedRailInfo.heightLevel, val);
            }).element,
        );
        appendActionRow(body, [{ label: "Delete rail", onClick: () => controller.deleteSelectedWall() }]);
        return true;
    }
    if (selectedForcefieldInfo && controller.isWallPlaceMode()) {
        appendForcefieldSelectedInspector(body, controller, selectedForcefieldInfo);
        return true;
    }
    return false;
}
