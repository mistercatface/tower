import { formatSandboxSpawnLabel } from "../../Props/PropCatalog.js";
import { resolveSandboxFaction } from "../../Sandbox/sandboxFaction.js";
import { isSpawnerProp, listSpawnerSpawnPropIds, resolveSpawnerPropId } from "../../Sandbox/spawnerConfig.js";
import { appendSandboxWorldPropInspectorFields, appendButtonWireInspector, appendChainLinkInspector } from "./sandboxWorldPropInspector.js";
import { appendShapeFamilySelectedFields } from "./sandboxShapeFamilyUi.js";
import { isShapeFamilyAsset } from "../../Sandbox/sandboxShapeFamilies.js";
import { isButtonEntity } from "../../Sandbox/buttonInput.js";
import { isChainLinkBall } from "../../Sandbox/chainLinks.js";
import { SANDBOX_PATH_VISUAL_LABELS, SANDBOX_PATH_VISUAL_OPTIONS } from "../../Sandbox/sandboxPropMeta.js";
import { appendCheckboxField, appendSelectField, appendEditorSubhead } from "../../UI/paramFields.js";
import { appendBehaviorModeField, appendFactionSelect } from "./sandboxUiFields.js";
import propCatalog from "../../../Assets/props/index.js";
export function appendSelectedPropInspector(body, state, controller, selectedProp, refreshPanel) {
    const behaviorIds = controller.listSelectedBehaviors();
    appendFactionSelect(body, {
        value: resolveSandboxFaction(selectedProp),
        onChange: (faction) => {
            selectedProp.faction = faction;
            refreshPanel();
        },
    });
    appendSandboxWorldPropInspectorFields(body, selectedProp, { state, onChange: refreshPanel });
    if (isShapeFamilyAsset(propCatalog[selectedProp.type])) appendShapeFamilySelectedFields(body, selectedProp);
    if (isButtonEntity(selectedProp))
        appendButtonWireInspector(body, {
            listLinks: () => controller.listSelectedButtonLinks(),
            isWireActive: () => controller.isButtonWireLinkActive(),
            startWire: () => controller.startButtonWireLink(),
            cancelWire: () => controller.cancelButtonWireLink(),
            clearLinks: () => controller.clearSelectedButtonLinks(),
            removeLink: (target) => controller.removeSelectedButtonLink(target),
        });
    if (isChainLinkBall(selectedProp))
        appendChainLinkInspector(body, {
            listLinks: () => controller.listSelectedChainLinks(),
            isWireActive: () => controller.isChainLinkActive(),
            startWire: () => controller.startChainLink(),
            cancelWire: () => controller.cancelChainLink(),
            clearLinks: () => controller.clearSelectedChainLinks(),
            removeLink: (constraintId) => controller.removeSelectedChainLink(constraintId),
            isChainHead: () => controller.isSelectedChainHead(),
            setChainHead: (enabled) => controller.setSelectedChainHead(enabled),
        });
    appendBehaviorModeField(body, behaviorIds, controller.getSelectedBehaviorId(), (value) => {
        controller.setSelectedBehaviorId(value);
    });
    const selectedAsset = propCatalog[selectedProp.type];
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
    if (state.editor?.debugInspect) {
        appendEditorSubhead(body, "Debug Inspection");
        const appendDebugReadOnlyField = (parent, labelText, valueText) => {
            const field = document.createElement("div");
            field.className = "param-field";
            const label = document.createElement("span");
            label.textContent = labelText;
            const valueSpan = document.createElement("span");
            valueSpan.className = "param-value";
            valueSpan.style.fontFamily = "monospace";
            valueSpan.textContent = String(valueText);
            field.append(label, valueSpan);
            parent.appendChild(field);
        };
        appendDebugReadOnlyField(body, "Type", selectedProp.type);
        appendDebugReadOnlyField(body, "Phys ID", selectedProp._physId !== undefined ? selectedProp._physId : "none");
        appendDebugReadOnlyField(body, "Active Slot", selectedProp._activeSlot !== undefined ? selectedProp._activeSlot : "none");
        appendDebugReadOnlyField(body, "Is Sleeping", selectedProp.isSleeping ? "true" : "false");
        appendDebugReadOnlyField(body, "Sleep Frames", selectedProp._sleepFrames !== undefined ? selectedProp._sleepFrames : "none");
        appendDebugReadOnlyField(body, "Velocity", `(${selectedProp.vx?.toFixed(2) ?? 0}, ${selectedProp.vy?.toFixed(2) ?? 0})`);
        appendDebugReadOnlyField(body, "Ang Velocity", selectedProp.angularVelocity?.toFixed(4) ?? 0);
        appendDebugReadOnlyField(body, "Shape Type", selectedProp.shape?.type ?? "none");
        appendDebugReadOnlyField(body, "Radius", selectedProp.radius?.toFixed(2) ?? 0);
        if (selectedProp.shape?.type === "Polygon") appendDebugReadOnlyField(body, "Vertices Count", selectedProp.shape.vertices.length / 2);
    }
}
