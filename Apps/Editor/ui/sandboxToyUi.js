import { getPropAsset, getWorldPropDefinitions, formatSandboxSpawnLabel } from "../../../Libraries/Props/PropCatalog.js";
import { isSandboxSpawnable } from "../../../Libraries/Sandbox/sandboxCapabilities.js";
import { appendFloorSelectedInspector } from "../../../Libraries/SandboxEditor/ui/sandboxFloorInspector.js";
import { appendRoomNodeSelectedInspector } from "../../../Libraries/SandboxEditor/ui/sandboxRoomSelectedInspector.js";
import { appendForcefieldSelectedInspector, appendRoomLinkCorridorInspector, appendWallPlaceParams, appendWallSelectedInspector } from "../../../Libraries/SandboxEditor/ui/sandboxWallInspector.js";
import { appendPropPlaceParams } from "../../../Libraries/SandboxEditor/ui/sandboxPropSpawnInspector.js";
import { appendSelectedPropInspector } from "../../../Libraries/SandboxEditor/ui/sandboxPropSelectedInspector.js";
import { buildPlacePaletteItems, appendPaletteTagFilters, appendSpawnPaletteGrid, sandboxPaletteMatchesFilter } from "../../../Libraries/SandboxEditor/ui/sandboxPlacePalette.js";
import { appendActionRow, appendEditorHint, appendInstanceList } from "../../../Libraries/UI/paramFields.js";
import { appendMapGenEditor } from "./mapGenEditors.js";
import { wrapLabUiSync } from "./preview.js";
function appendPinnedSection(parent, id, title, build, headExtra = null) {
    const block = document.createElement("div");
    block.className = "editor-block editor-block-pinned";
    block.dataset.sandboxSection = id;
    const head = document.createElement("div");
    head.className = "editor-block-title editor-block-title-row";
    const titleEl = document.createElement("span");
    titleEl.textContent = title;
    head.appendChild(titleEl);
    if (headExtra) headExtra(head);
    block.appendChild(head);
    const sectionBody = document.createElement("div");
    build(sectionBody);
    block.appendChild(sectionBody);
    parent.appendChild(block);
    return block;
}
function appendGridSelectionInspector(body, state, controller, selection) {
    const { selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo, selectedPowerSource, selectedFloorBelt, selectedRoomNode, selectedRoomLink } = selection;
    if (appendWallSelectedInspector(body, state, controller, { selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo })) return true;
    if (selectedForcefieldInfo) {
        appendForcefieldSelectedInspector(body, controller, selectedForcefieldInfo, { promptReselect: true });
        return true;
    }
    if (appendFloorSelectedInspector(body, controller, { selectedPowerSource, selectedFloorBelt })) return true;
    if (selectedRoomNode) {
        appendRoomNodeSelectedInspector(body, state, controller, selectedRoomNode);
        return true;
    }
    if (selectedRoomLink) {
        appendRoomLinkCorridorInspector(body, state, selectedRoomLink, controller);
        return true;
    }
    return false;
}
export function mountSandboxToyUi(container, state, controller) {
    let paletteTagFilter = "all";
    const propIds = Object.keys(getWorldPropDefinitions())
        .filter((id) => isSandboxSpawnable(getPropAsset(id)))
        .sort((a, b) => formatSandboxSpawnLabel(a).localeCompare(formatSandboxSpawnLabel(b)));
    const bootstrapPaletteItems = buildPlacePaletteItems(propIds);
    if (!controller.getPlacePaletteKey() && bootstrapPaletteItems.length > 0) {
        const firstProp = bootstrapPaletteItems.find((item) => item.kind === "prop") ?? bootstrapPaletteItems[0];
        controller.setPlacePaletteKey(firstProp.key);
    }
    function refreshPanel() {
        container.innerHTML = "";
        const allPaletteItems = buildPlacePaletteItems(propIds);
        if (allPaletteItems.length === 0) {
            appendEditorHint(container, "No sandbox spawn options loaded");
            return;
        }
        const paletteItems = allPaletteItems.filter((item) => sandboxPaletteMatchesFilter(paletteTagFilter, item.tags));
        if (paletteItems.length === 0) {
            appendPinnedSection(
                container,
                "palette",
                "Props",
                (body) => {
                    appendEditorHint(body, "No props match this filter.");
                },
                (head) => {
                    appendPaletteTagFilters(head, paletteTagFilter, (filter) => {
                        paletteTagFilter = filter;
                        refreshPanel();
                    });
                },
            );
            return;
        }
        const paletteKey = controller.getPlacePaletteKey();
        if (paletteKey !== "" && !paletteItems.some((item) => item.key === paletteKey)) {
            controller.setPlacePaletteKey(paletteItems[0].key);
            return;
        }
        const activeItem = paletteKey === "" ? null : (paletteItems.find((item) => item.key === paletteKey) ?? paletteItems[0]);
        const { selectedPropIds, selectedProp, selectedFloorBelt, selectedPowerSource, selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo, selectedRoomLink, selectedRoomNode } =
            controller.getSelectionInspectors();
        const selectedPropIdSet = new Set(selectedPropIds);
        const wallStampMode = controller.getWallStampMode();
        const selectionCount = selectedPropIdSet.size;
        appendPinnedSection(
            container,
            "palette",
            "Props",
            (body) => {
                appendSpawnPaletteGrid(body, paletteItems, paletteKey, (key) => {
                    controller.setPlacePaletteKey(key);
                });
            },
            (head) => {
                appendPaletteTagFilters(head, paletteTagFilter, (filter) => {
                    paletteTagFilter = filter;
                    refreshPanel();
                });
            },
        );
        appendPinnedSection(container, "spawn", "Spawn", (body) => {
            const paramsHost = document.createElement("div");
            paramsHost.className = "spawn-palette-params";
            body.appendChild(paramsHost);
            if (!activeItem) appendEditorHint(paramsHost, "Pick from Props above to place on the map.");
            else if (activeItem.kind === "prop") appendPropPlaceParams(paramsHost, controller, activeItem.key.slice(5), refreshPanel);
            else if (activeItem.kind === "wall") appendWallPlaceParams(paramsHost, state, controller, { wallStampMode, selectedVoxelInfo, selectedRailInfo });
            else appendMapGenEditor(paramsHost, state, activeItem.genKind, refreshPanel);
        });
        appendPinnedSection(container, "selected", "Selected", (body) => {
            if (selectionCount > 1) {
                appendEditorHint(body, `${selectionCount} props selected. Drag on empty space to box-select, or click one prop to select only that.`);
                appendActionRow(body, [{ label: `Delete ${selectionCount} props`, onClick: () => controller.deleteSelectedProps() }]);
                return;
            }
            if (!selectedProp) {
                if (
                    appendGridSelectionInspector(body, state, controller, {
                        selectedVoxelInfo,
                        selectedRailInfo,
                        selectedForcefieldInfo,
                        selectedPowerSource,
                        selectedFloorBelt,
                        selectedRoomNode,
                        selectedRoomLink,
                    })
                )
                    return;
                appendEditorHint(body, "Select an item from Scene, or pick from Props to place on the map.");
                return;
            }
            appendSelectedPropInspector(body, state, controller, selectedProp, refreshPanel);
        });
        appendPinnedSection(container, "scene", "Scene", (body) => {
            appendInstanceList(
                body,
                controller
                    .listPlacedSceneItems()
                    .map((item) => ({
                        label: item.label,
                        selected: controller.isSceneItemSelected(item),
                        onSelect: () => controller.selectSceneItem(item),
                        onDelete: () => controller.deleteSceneItem(item),
                    })),
                "Nothing placed yet.",
            );
        });
    }
    controller.setUiSync(wrapLabUiSync(refreshPanel));
    refreshPanel();
    return () => {
        controller.setUiSync(null);
        container.innerHTML = "";
    };
}
