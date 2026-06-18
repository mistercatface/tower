import { getPropAsset, getWorldPropDefinitions, formatSandboxSpawnLabel } from "../../../Libraries/Props/PropCatalog.js";
import { isSandboxSpawnable, sandboxTagsMatchFilter } from "../../../Libraries/Sandbox/sandboxCapabilities.js";
import { wallPlaceInspector } from "../../../Libraries/Sandbox/sandboxScenePlaceables.js";
import { appendSelectionInspector } from "../../../Libraries/SandboxEditor/ui/sandboxPlaceableInspectorUi.js";
import { appendWallPlaceParams } from "../../../Libraries/SandboxEditor/ui/sandboxWallInspector.js";
import { appendPropPlaceParams } from "../../../Libraries/SandboxEditor/ui/sandboxPropSpawnInspector.js";
import { appendSandboxSelectionPanel } from "../../../Libraries/SandboxEditor/ui/sandboxSelectionPanelUi.js";
import { buildPlacePaletteItems, appendSandboxTagFilters, appendSpawnPaletteGrid } from "../../../Libraries/SandboxEditor/ui/sandboxPlacePalette.js";
import { appendEditorHint, appendInstanceList } from "../../../Libraries/UI/paramFields.js";
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
        const paletteItems = allPaletteItems.filter((item) => sandboxTagsMatchFilter(paletteTagFilter, item.tags));
        if (paletteItems.length === 0) {
            appendPinnedSection(
                container,
                "palette",
                "Props",
                (body) => {
                    appendEditorHint(body, "No props match this filter.");
                },
                (head) => {
                    appendSandboxTagFilters(
                        head,
                        paletteTagFilter,
                        (filter) => {
                            paletteTagFilter = filter;
                            refreshPanel();
                        },
                        "Prop palette filters",
                    );
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
        const inspector = controller.getSelectionInspector();
        const wallStampMode = controller.getWallStampMode();
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
                appendSandboxTagFilters(
                    head,
                    paletteTagFilter,
                    (filter) => {
                        paletteTagFilter = filter;
                        refreshPanel();
                    },
                    "Prop palette filters",
                );
            },
        );
        appendPinnedSection(container, "spawn", "Spawn", (body) => {
            const paramsHost = document.createElement("div");
            paramsHost.className = "spawn-palette-params";
            body.appendChild(paramsHost);
            if (!activeItem) appendEditorHint(paramsHost, "Pick from Props above to place on the map.");
            else if (activeItem.kind === "prop") appendPropPlaceParams(paramsHost, controller, activeItem.key.slice(5), refreshPanel);
            else if (activeItem.kind === "wall") appendWallPlaceParams(paramsHost, state, controller, { wallStampMode, inspector: wallPlaceInspector(inspector) });
            else appendMapGenEditor(paramsHost, state, activeItem.genKind, refreshPanel);
        });
        appendPinnedSection(
            container,
            "selection",
            "Selection",
            (body) => {
                appendSandboxSelectionPanel(body, controller, refreshPanel);
            },
            (head) => {
                appendSandboxTagFilters(
                    head,
                    controller.getSelectionTagFilter(),
                    (filter) => {
                        controller.setSelectionTagFilter(filter);
                        refreshPanel();
                    },
                    "Selection filters",
                );
            },
        );
        appendPinnedSection(container, "selected", "Selected", (body) => {
            if (inspector) appendSelectionInspector(body, state, controller, inspector, refreshPanel);
            else appendEditorHint(body, "Select an item from Scene, or pick from Props to place on the map.");
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
