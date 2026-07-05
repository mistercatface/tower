import { formatSandboxSpawnLabel } from "../../Props/props.js";
import {
    resolveSandboxFaction,
    SANDBOX_DEFAULT_FACTION,
    SANDBOX_FACTION_OPTIONS,
    getSandboxBehaviorLabel,
    isShapeFamilyAsset,
    SANDBOX_PATH_VISUAL_LABELS,
    SANDBOX_PATH_VISUAL_OPTIONS,
    isSpawnerProp,
    listSpawnerSpawnPropIds,
    resolveSpawnerPropId,
    isChainLinkBall,
} from "../../Sandbox/sandbox.js";
import { appendSandboxWorldPropInspectorFields, appendButtonWireInspector, appendChainLinkInspector } from "./sandboxWorldPropInspector.js";
import { appendShapeFamilySelectedFields } from "./sandboxShapeFamilyUi.js";
import { isButtonEntity } from "../../Props/props.js";
import { appendCheckboxField, appendSelectField, appendEditorSubhead } from "../../UI/paramFields.js";
import propCatalog from "../../../Assets/props/index.js";
function appendFactionSelect(parent, { value, onChange }) {
    appendSelectField(parent, "Team", { value: value ?? SANDBOX_DEFAULT_FACTION, options: SANDBOX_FACTION_OPTIONS.map((option) => ({ value: option.id, label: option.label })), onChange });
}
function appendBehaviorModeField(parent, behaviorIds, value, onChange) {
    if (behaviorIds.length === 0) return;
    appendSelectField(parent, "Mode", { value, options: behaviorIds.map((behaviorId) => ({ value: behaviorId, label: getSandboxBehaviorLabel(behaviorId) })), onChange });
}
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
}
