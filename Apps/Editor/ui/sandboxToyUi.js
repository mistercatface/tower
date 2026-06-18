import { getPropAsset, getWorldPropDefinitions, formatSandboxSpawnLabel } from "../../../Libraries/Props/PropCatalog.js";
import { isSandboxSpawnable, sandboxTagsMatchFilter } from "../../../Libraries/Sandbox/sandboxCapabilities.js";
import { orderSandboxPalettePropIds } from "../../../Libraries/Sandbox/sandboxShapeFamilies.js";
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
    return { block, head, body: sectionBody };
}
function clearElement(el) {
    el.replaceChildren();
}
export function mountSandboxToyUi(container, state, controller) {
    let paletteTagFilter = "all";
    const propIds = orderSandboxPalettePropIds(Object.keys(getWorldPropDefinitions()).filter((id) => isSandboxSpawnable(getPropAsset(id))));
    const bootstrapPaletteItems = buildPlacePaletteItems(propIds);
    if (!controller.getPlacePaletteKey() && bootstrapPaletteItems.length > 0) {
        const firstProp = bootstrapPaletteItems.find((item) => item.kind === "prop") ?? bootstrapPaletteItems[0];
        controller.setPlacePaletteKey(firstProp.key);
    }
    const sections = { paletteHead: null, paletteBody: null, spawnBody: null, selectionHead: null, selectionBody: null, selectedBody: null, sceneBody: null };
    function mountShell() {
        container.replaceChildren();
        const palette = appendPinnedSection(
            container,
            "palette",
            "Props",
            (body) => {
                sections.paletteBody = body;
            },
            (head) => {
                sections.paletteHead = head;
            },
        );
        const spawn = appendPinnedSection(container, "spawn", "Spawn", (body) => {
            sections.spawnBody = body;
        });
        const selected = appendPinnedSection(container, "selected", "Selected", (body) => {
            sections.selectedBody = body;
        });
        const selection = appendPinnedSection(
            container,
            "selection",
            "Selection",
            (body) => {
                sections.selectionBody = body;
            },
            (head) => {
                sections.selectionHead = head;
            },
        );
        const scene = appendPinnedSection(container, "scene", "Scene", (body) => {
            sections.sceneBody = body;
        });
        return { palette, spawn, selection, selected, scene };
    }
    function refreshPaletteHead() {
        clearElement(sections.paletteHead);
        const titleEl = document.createElement("span");
        titleEl.textContent = "Props";
        sections.paletteHead.appendChild(titleEl);
        appendSandboxTagFilters(
            sections.paletteHead,
            paletteTagFilter,
            (filter) => {
                paletteTagFilter = filter;
                refreshPanel();
            },
            "Prop palette filters",
        );
    }
    function refreshSelectionHead() {
        clearElement(sections.selectionHead);
        const titleEl = document.createElement("span");
        titleEl.textContent = "Selection";
        sections.selectionHead.appendChild(titleEl);
        appendSandboxTagFilters(
            sections.selectionHead,
            controller.getSelectionTagFilter(),
            (filter) => {
                controller.setSelectionTagFilter(filter);
                refreshPanel();
            },
            "Selection filters",
        );
    }
    function refreshPanel() {
        if (!sections.paletteBody) mountShell();
        const allPaletteItems = buildPlacePaletteItems(propIds);
        if (allPaletteItems.length === 0) {
            container.replaceChildren();
            sections.paletteBody = null;
            appendEditorHint(container, "No sandbox spawn options loaded");
            return;
        }
        const paletteItems = allPaletteItems.filter((item) => sandboxTagsMatchFilter(paletteTagFilter, item.tags));
        if (paletteItems.length === 0) {
            clearElement(sections.paletteBody);
            refreshPaletteHead();
            appendEditorHint(sections.paletteBody, "No props match this filter.");
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
        refreshPaletteHead();
        clearElement(sections.paletteBody);
        appendSpawnPaletteGrid(sections.paletteBody, paletteItems, paletteKey, (key) => {
            controller.setPlacePaletteKey(key);
        });
        clearElement(sections.spawnBody);
        const paramsHost = document.createElement("div");
        paramsHost.className = "spawn-palette-params";
        sections.spawnBody.appendChild(paramsHost);
        if (inspector) appendEditorHint(paramsHost, "Pick from Props above to place on the map.");
        else if (!activeItem) appendEditorHint(paramsHost, "Pick from Props above to place on the map.");
        else if (activeItem.kind === "prop") appendPropPlaceParams(paramsHost, controller, activeItem.key.slice(5), refreshPanel);
        else if (activeItem.kind === "wall") appendWallPlaceParams(paramsHost, state, controller, { wallStampMode, inspector: wallPlaceInspector(inspector) });
        else appendMapGenEditor(paramsHost, state, activeItem.genKind, refreshPanel);
        refreshSelectionHead();
        clearElement(sections.selectionBody);
        appendSandboxSelectionPanel(sections.selectionBody, controller, refreshPanel);
        clearElement(sections.selectedBody);
        if (inspector) appendSelectionInspector(sections.selectedBody, state, controller, inspector, refreshPanel);
        else appendEditorHint(sections.selectedBody, "Select an item from Scene, or pick from Props to place on the map.");
        clearElement(sections.sceneBody);
        appendInstanceList(
            sections.sceneBody,
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
    }
    controller.setUiSync(wrapLabUiSync(refreshPanel));
    refreshPanel();
    return () => {
        controller.setUiSync(null);
        container.replaceChildren();
        sections.paletteBody = null;
    };
}
