import { getPropAsset, getWorldPropDefinitions, formatSandboxSpawnLabel } from "../../../Libraries/Props/PropCatalog.js";
import { isSandboxSpawnable } from "../../../Libraries/Sandbox/sandboxCapabilities.js";
import { appendGridSelectionInspector } from "../../../Libraries/SandboxEditor/ui/sandboxSelectedInspector.js";
import { appendWallPlaceParams } from "../../../Libraries/SandboxEditor/ui/sandboxWallInspector.js";
import { appendPropPlaceParams } from "../../../Libraries/SandboxEditor/ui/sandboxPropSpawnInspector.js";
import { appendSelectedPropInspector } from "../../../Libraries/SandboxEditor/ui/sandboxPropSelectedInspector.js";
import { appendPinnedSection } from "../../../Libraries/SandboxEditor/ui/sandboxPanelSections.js";
import { buildPlacePaletteItems, appendPaletteTagFilters, appendSpawnPaletteGrid } from "../../../Libraries/SandboxEditor/ui/sandboxPlacePalette.js";
import { sandboxPaletteMatchesFilter } from "../../../Libraries/SandboxEditor/ui/sandboxPaletteTags.js";
import { appendActionRow, appendEditorHint, appendInstanceList } from "../../../Libraries/UI/paramFields.js";
import { appendMapGenEditor } from "./mapGenEditors.js";
import { wrapLabUiSync } from "./preview.js";
export function mountSandboxToyUi(container, state, controller) {
    let paletteTagFilter = "all";
    const propIds = Object.keys(getWorldPropDefinitions())
        .filter((id) => isSandboxSpawnable(getPropAsset(id)))
        .sort((a, b) => formatSandboxSpawnLabel(a).localeCompare(formatSandboxSpawnLabel(b)));
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
        if (!paletteItems.some((item) => item.key === paletteKey)) {
            controller.setPlacePaletteKey(paletteItems[0].key);
            return;
        }
        const activeItem = paletteItems.find((item) => item.key === paletteKey) ?? paletteItems[0];
        const selectedPropIds = new Set(controller.getSelectedPropIds());
        const selectedProp = controller.getSelectedProp();
        const selectedFloorBelt = controller.getSelectedFloorBeltInfo();
        const selectedPowerSource = controller.getSelectedPassagePowerSourceInfo();
        const selectedVoxelInfo = controller.getSelectedVoxelWallInfo();
        const selectedRailInfo = controller.getSelectedRailWallInfo();
        const selectedForcefieldInfo = controller.getSelectedForcefieldInfo();
        const selectedRoomLink = controller.getSelectedRoomLinkInfo();
        const selectedRoomNode = controller.getSelectedRoomNodeInfo();
        const wallStampMode = controller.getWallStampMode();
        const selectionCount = selectedPropIds.size;
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
            if (activeItem.kind === "prop") appendPropPlaceParams(paramsHost, controller, activeItem.key.slice(5), refreshPanel);
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
