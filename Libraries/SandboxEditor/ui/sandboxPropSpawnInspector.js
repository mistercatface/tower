import { getPropAsset } from "../../Props/PropCatalog.js";
import { CORRIDOR_AUTHORING_TYPE_OPTIONS } from "../../RoomGraph/roomGraphCorridorTypes.js";
import {
    isGridFloorBeltSpawnAsset,
    isGridPassagePowerSourceSpawnAsset,
    isRoomLinkSpawnAsset,
    isRoomNodeSpawnAsset,
    isPuzzleTemplateSpawnAsset,
    isSingleWorldPropSpawnAsset,
} from "../../Sandbox/sandboxCapabilities.js";
import { appendSurfaceProfileField } from "../../RoomGraph/roomGraphSurfaceProfile.js";
import { appendAxisNumberFields, appendEditorHint, appendNumberField, appendSelectField } from "../../UI/paramFields.js";
import { appendBehaviorModeField, appendFactionSelect } from "./sandboxUiFields.js";
import { appendShapeFamilySpawnFields } from "./sandboxShapeFamilyUi.js";
import { isShapeFamilyAsset } from "../../Sandbox/sandboxShapeFamilies.js";
function appendSpawnFooter(body, controller, spawnAsset, refreshPanel, { showAddAtCamera }) {
    const addRow = document.createElement("div");
    addRow.className = "sandbox-add-row";
    if (
        spawnAsset &&
        !isGridFloorBeltSpawnAsset(spawnAsset) &&
        !isGridPassagePowerSourceSpawnAsset(spawnAsset) &&
        !isRoomNodeSpawnAsset(spawnAsset) &&
        !isRoomLinkSpawnAsset(spawnAsset) &&
        !isPuzzleTemplateSpawnAsset(spawnAsset)
    )
        appendFactionSelect(addRow, {
            value: controller.getSpawnFaction(),
            onChange: (faction) => {
                controller.setSpawnFaction(faction);
                refreshPanel();
            },
        });
    const spawnBehaviorIds = controller.listSpawnBehaviors();
    if (isSingleWorldPropSpawnAsset(spawnAsset) && spawnBehaviorIds.length > 0)
        appendBehaviorModeField(addRow, spawnBehaviorIds, controller.getSpawnBehaviorId(), (value) => {
            controller.setSpawnBehaviorId(value);
        });
    if (showAddAtCamera) {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "secondary";
        addBtn.textContent = "Add at camera";
        addBtn.addEventListener("click", () => controller.spawnAtCameraOrigin());
        addRow.appendChild(addBtn);
    }
    body.appendChild(addRow);
}
export function appendPropPlaceParams(body, controller, spawnId, refreshPanel) {
    const spawnAsset = getPropAsset(spawnId);
    if (isRoomLinkSpawnAsset(spawnAsset)) {
        const fromNodeId = controller.getCorridorLinkWireFromNodeId();
        appendSelectField(body, "Type", {
            value: controller.getSpawnCorridorType(),
            options: CORRIDOR_AUTHORING_TYPE_OPTIONS,
            onChange: (value) => {
                controller.setSpawnCorridorType(value);
            },
        });
        appendNumberField(body, "Width", {
            value: controller.getSpawnCorridorWidth(),
            step: 1,
            min: 1,
            max: 8,
            onChange: (width) => {
                controller.setSpawnCorridorWidth(width);
            },
        });
        appendSurfaceProfileField(body, "Floor profile", controller.getSpawnCorridorSurfaceProfileId(), (profileId) => {
            controller.setSpawnCorridorSurfaceProfileId(profileId);
        });
        appendEditorHint(
            body,
            fromNodeId != null
                ? "Source room selected — click the target room. The corridor draws immediately; pick it from Scene to adjust type, width, or reroll."
                : "Pick type and width, then click the source room and target room.",
        );
        appendSpawnFooter(body, controller, spawnAsset, refreshPanel, { showAddAtCamera: false });
        return;
    }
    if (isRoomNodeSpawnAsset(spawnAsset)) {
        appendAxisNumberFields(body, {
            Width: {
                value: controller.getSpawnRoomNodeCols(),
                step: 1,
                min: 1,
                onChange: (cols) => {
                    controller.setSpawnRoomNodeCols(cols);
                },
            },
            Height: {
                value: controller.getSpawnRoomNodeRows(),
                step: 1,
                min: 1,
                onChange: (rows) => {
                    controller.setSpawnRoomNodeRows(rows);
                },
            },
        });
        appendSurfaceProfileField(body, "Floor profile", controller.getSpawnRoomNodeSurfaceProfileId(), (profileId) => {
            controller.setSpawnRoomNodeSurfaceProfileId(profileId);
        });
        appendEditorHint(body, "Hover the map to preview the footprint. Blocked cells turn red; click only places when every cell is clear.");
        appendSpawnFooter(body, controller, spawnAsset, refreshPanel, { showAddAtCamera: false });
        return;
    }
    if (isPuzzleTemplateSpawnAsset(spawnAsset)) {
        appendAxisNumberFields(body, {
            Width: {
                value: controller.getSpawnPuzzleAreaCols(),
                step: 1,
                min: 28,
                onChange: (cols) => {
                    controller.setSpawnPuzzleAreaCols(cols);
                },
            },
            Height: {
                value: controller.getSpawnPuzzleAreaRows(),
                step: 1,
                min: 24,
                onChange: (rows) => {
                    controller.setSpawnPuzzleAreaRows(rows);
                },
            },
        });
        appendEditorHint(body, "Click to stamp three rooms with random sizes and positions inside the area. Links are fixed: belt A→B, belt B→A, locked B→C. Room A gets a blue ball and crate.");
        appendSpawnFooter(body, controller, spawnAsset, refreshPanel, { showAddAtCamera: false });
        return;
    }
    if (isGridPassagePowerSourceSpawnAsset(spawnAsset))
        appendEditorHint(body, "Add at camera stamps a power source on the grid. Enable Default energized in Selected, or wire a floor button to the source cell.");
    else if (isShapeFamilyAsset(spawnAsset)) appendShapeFamilySpawnFields(body, controller, spawnId);
    appendSpawnFooter(body, controller, spawnAsset, refreshPanel, { showAddAtCamera: true });
}
