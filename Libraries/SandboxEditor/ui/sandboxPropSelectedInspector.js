import { formatSandboxSpawnLabel  } from "../../Props/PropCatalog.js";
import { resolveSandboxFaction } from "../../Sandbox/sandboxFaction.js";
import { isSpawnerProp, listSpawnerSpawnPropIds, resolveSpawnerPropId } from "../../Sandbox/spawnerConfig.js";
import { appendSandboxWorldPropInspectorFields, appendButtonWireInspector, appendChainLinkInspector } from "./sandboxWorldPropInspector.js";
import { appendShapeFamilySelectedFields } from "./sandboxShapeFamilyUi.js";
import { isShapeFamilyAsset } from "../../Sandbox/sandboxShapeFamilies.js";
import { isButtonEntity } from "../../Sandbox/buttonInput.js";
import { isChainLinkBall } from "../../Sandbox/chainLinks.js";
import { SANDBOX_PATH_VISUAL_LABELS, SANDBOX_PATH_VISUAL_OPTIONS } from "../../Sandbox/sandboxPropMeta.js";
import { appendCheckboxField, appendSelectField } from "../../UI/paramFields.js";
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
}
