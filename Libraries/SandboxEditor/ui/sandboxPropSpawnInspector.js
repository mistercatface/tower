import propCatalog from "../../../Assets/props/index.js";
import { isGridFloorBeltSpawnAsset, isSingleWorldPropSpawnAsset, getSandboxBehaviorLabel } from "../../Sandbox/sandboxCapabilities.js";
import { appendEditorHint, appendNumberField, appendSelectField } from "../../UI/paramFields.js";
import { SANDBOX_DEFAULT_FACTION, SANDBOX_FACTION_OPTIONS } from "../../Sandbox/sandboxFaction.js";
import { appendShapeFamilySpawnFields, appendCoatFields } from "./sandboxShapeFamilyUi.js";
import { isShapeFamilyAsset } from "../../Sandbox/sandboxShapeFamilies.js";
import { markLabViewDirty } from "../../../Apps/Editor/ui/preview.js";
function appendFactionSelect(parent, { value, onChange }) {
    appendSelectField(parent, "Team", { value: value ?? SANDBOX_DEFAULT_FACTION, options: SANDBOX_FACTION_OPTIONS.map((option) => ({ value: option.id, label: option.label })), onChange });
}
function appendBehaviorModeField(parent, behaviorIds, value, onChange) {
    if (behaviorIds.length === 0) return;
    appendSelectField(parent, "Mode", { value, options: behaviorIds.map((behaviorId) => ({ value: behaviorId, label: getSandboxBehaviorLabel(behaviorId) })), onChange });
}
function appendSpawnFooter(body, controller, spawnAsset, refreshPanel, { showAddAtCamera }) {
    const addRow = document.createElement("div");
    addRow.className = "sandbox-add-row";
    if (spawnAsset && !isGridFloorBeltSpawnAsset(spawnAsset))
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
    const spawnAsset = propCatalog[spawnId];
    if (spawnId === "snake") {
        appendNumberField(body, "Length", {
            value: controller.getSpawnSnakeLength(),
            step: 1,
            min: 3,
            max: 9,
            onChange: (length) => {
                controller.setSpawnSnakeLength(length);
            },
        });
        appendNumberField(body, "Radius", {
            value: controller.getSpawnBallRadius(spawnAsset),
            step: 1,
            min: 1,
            max: 4,
            onChange: (radius) => {
                controller.setSpawnBallRadius(Math.max(1, Math.min(4, radius)));
            },
        });
        appendCoatFields(body, {
            tint: controller.getSpawnVisualOverrideTint(spawnAsset),
            brightness: controller.getSpawnVisualOverrideBrightness(),
            onTintChange: (hex) => {
                controller.setSpawnVisualOverrideTint(hex);
                markLabViewDirty();
            },
            onBrightnessChange: (brightness) => {
                controller.setSpawnVisualOverrideBrightness(brightness);
                markLabViewDirty();
            },
        });
    } else if (isShapeFamilyAsset(spawnAsset)) appendShapeFamilySpawnFields(body, controller, spawnId);
    appendSpawnFooter(body, controller, spawnAsset, refreshPanel, { showAddAtCamera: true });
}
