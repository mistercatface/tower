import { getPropAsset, formatSandboxSpawnLabel } from "../Props/PropCatalog.js";
import { resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { isSandboxEquippable } from "./sandboxCapabilities.js";
import { isSpawnerProp, listSpawnerSpawnPropIds, resolveSpawnerPropId } from "./spawnerConfig.js";
import { appendSandboxWorldPropInspectorFields, appendButtonWireInspector } from "./sandboxWorldPropInspector.js";
import { renderSandboxEquipPanel } from "./sandboxEquipPanel.js";
import { isButtonEntity } from "./buttonInput.js";
import { SANDBOX_PATH_VISUAL_LABELS, SANDBOX_PATH_VISUAL_OPTIONS } from "./sandboxPathVisual.js";
import { SANDBOX_PROP_VISUAL_LABELS, SANDBOX_PROP_VISUAL_OPTIONS } from "./sandboxPropVisual.js";
import { appendCheckboxField, appendSelectField } from "../UI/paramFields.js";
import { appendBehaviorModeField, appendFactionSelect } from "./sandboxUiFields.js";
export function appendSelectedPropInspector(body, controller, selectedProp, refreshPanel) {
    const behaviorIds = controller.listSelectedBehaviors();
    appendFactionSelect(body, {
        value: resolveSandboxFaction(selectedProp),
        onChange: (faction) => {
            selectedProp.faction = faction;
            refreshPanel();
        },
    });
    appendSandboxWorldPropInspectorFields(body, selectedProp, { state: controller.getState(), onChange: refreshPanel });
    if (isButtonEntity(selectedProp))
        appendButtonWireInspector(body, {
            listLinks: () => controller.listSelectedButtonLinks(),
            isWireActive: () => controller.isButtonWireLinkActive(),
            startWire: () => controller.startButtonWireLink(),
            cancelWire: () => controller.cancelButtonWireLink(),
            clearLinks: () => controller.clearSelectedButtonLinks(),
            removeLink: (target) => controller.removeSelectedButtonLink(target),
        });
    appendBehaviorModeField(body, behaviorIds, controller.getSelectedBehaviorId(), (value) => {
        controller.setSelectedBehaviorId(value);
    });
    const selectedAsset = getPropAsset(selectedProp.type);
    if (isSpawnerProp(selectedAsset)) {
        const spawnPropIds = listSpawnerSpawnPropIds();
        if (spawnPropIds.length)
            appendSelectField(body, "Spawn prop", {
                value: resolveSpawnerPropId(selectedProp, selectedAsset),
                options: spawnPropIds.map((id) => ({ value: id, label: formatSandboxSpawnLabel(id) })),
                onChange: (value) => {
                    selectedProp.sandboxSpawnerPropId = value;
                    refreshPanel();
                },
            });
    }
    appendCheckboxField(body, "Focus", {
        name: "cameraFocus",
        checked: controller.isCameraTarget(selectedProp),
        onChange: (checked) => {
            controller.setCameraTarget(checked, selectedProp);
        },
    });
    appendSelectField(body, "Path visual", {
        value: controller.getPathVisual(selectedProp),
        options: SANDBOX_PATH_VISUAL_OPTIONS.map((optionId) => ({ value: optionId, label: SANDBOX_PATH_VISUAL_LABELS[optionId] })),
        onChange: (value) => {
            controller.setPathVisual(value, selectedProp);
        },
    });
    appendSelectField(body, "Visual", {
        value: controller.getPropVisual(selectedProp),
        options: SANDBOX_PROP_VISUAL_OPTIONS.map((optionId) => ({ value: optionId, label: SANDBOX_PROP_VISUAL_LABELS[optionId] })),
        onChange: (value) => {
            controller.setPropVisual(value, selectedProp);
        },
    });
    if (isSandboxEquippable(getPropAsset(selectedProp.type))) {
        const equipPanel = document.createElement("div");
        equipPanel.className = "sandbox-equip-panel";
        renderSandboxEquipPanel(equipPanel, selectedProp, refreshPanel);
        body.appendChild(equipPanel);
    }
}
