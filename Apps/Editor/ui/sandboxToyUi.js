import { getPropAsset, getWorldPropDefinitions, formatSandboxSpawnLabel } from "../../../Libraries/Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, SANDBOX_FACTION_OPTIONS, resolveSandboxFaction } from "../../../Libraries/Combat/sandboxTargeting.js";
import {
    getSandboxBehaviorLabel,
    isSandboxEquippable,
    isSandboxSpawnable,
    isGridFloorBeltSpawnAsset,
    isGridPassagePowerSourceSpawnAsset,
    isRoomNodeSpawnAsset,
    isRoomLinkSpawnAsset,
    isSingleWorldPropSpawnAsset,
    listFloorBeltKindOptions,
} from "../../../Libraries/Sandbox/sandboxCapabilities.js";
import { isSpawnerProp, listSpawnerSpawnPropIds, resolveSpawnerPropId } from "../../../Libraries/Sandbox/spawnerConfig.js";
import { appendSandboxWorldPropInspectorFields, appendButtonWireInspector, appendRoomNodeWireInspector } from "../../../Libraries/Sandbox/sandboxWorldPropInspector.js";
import { isButtonEntity } from "../../../Libraries/Sandbox/buttonInput.js";
import { renderSandboxEquipPanel } from "../../../Libraries/Sandbox/sandboxEquipPanel.js";
import { SANDBOX_PATH_VISUAL_LABELS, SANDBOX_PATH_VISUAL_OPTIONS } from "../../../Libraries/Sandbox/sandboxPathVisual.js";
import { SANDBOX_PROP_VISUAL_LABELS, SANDBOX_PROP_VISUAL_OPTIONS } from "../../../Libraries/Sandbox/sandboxPropVisual.js";
import { formatGridWallEdgeSideLabel } from "../../../Libraries/Sandbox/gridWallEdit.js";
import { appendAxisNumberFields, appendEditorHint, appendInstanceList, appendNumberField, appendSelectField } from "../../../Libraries/UI/paramFields.js";
import { SliderControl } from "../../../Libraries/UI/controls/SliderControl.js";
import { appendMapGenEditor } from "./mapGenEditors.js";
import { SANDBOX_PALETTE_TAG_FILTERS, resolvePlacePaletteTags, sandboxPaletteMatchesFilter } from "../../../Libraries/Sandbox/sandboxPaletteTags.js";
const WALL_STAMP_OPTIONS = [
    { value: "voxel", label: "Voxel block" },
    { value: "rail", label: "Rail wall" },
    { value: "forcefield", label: "Forcefield" },
];
const PASSAGE_MODE_OPTIONS = [
    { value: "solid", label: "Solid — wall when powered" },
    { value: "oneWay", label: "One-way — block against allowed side" },
    { value: "tripwire", label: "Tripwire — sensor, never blocks" },
];
const EDGE_SIDE_OPTIONS = [
    { value: "0", label: formatGridWallEdgeSideLabel(0) },
    { value: "1", label: formatGridWallEdgeSideLabel(1) },
    { value: "2", label: formatGridWallEdgeSideLabel(2) },
    { value: "3", label: formatGridWallEdgeSideLabel(3) },
];
/** @param {HTMLElement} body @param {NonNullable<ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController["getSelectedRoomLinkInfo"]>>} selectedRoomLink @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller */
function appendRoomLinkCorridorInspector(body, selectedRoomLink, controller) {
    const limitHint = selectedRoomLink.maxCorridorWidth != null ? ` Max width for this wall pair: ${selectedRoomLink.maxCorridorWidth}.` : "";
    appendEditorHint(body, `${selectedRoomLink.label}. Change width, then Reroll to regenerate the path.${limitHint}`);
    appendNumberField(body, "Width", {
        value: selectedRoomLink.corridorWidthMin ?? 1,
        step: 1,
        min: 1,
        max: selectedRoomLink.maxCorridorWidth ?? 1,
        onChange: (width) => {
            controller.updateSelectedRoomLink({ corridorWidthMin: width, corridorWidthMax: width });
        },
    });
    const intersectRow = document.createElement("label");
    intersectRow.className = "param-field check-inline";
    const intersectCheck = document.createElement("input");
    intersectCheck.type = "checkbox";
    intersectCheck.checked = selectedRoomLink.canIntersect === true;
    intersectCheck.addEventListener("change", () => {
        controller.updateSelectedRoomLink({ canIntersect: intersectCheck.checked });
    });
    intersectRow.append(intersectCheck, document.createTextNode(" Corridors may intersect"));
    body.appendChild(intersectRow);
    const actionRow = document.createElement("div");
    actionRow.className = "sandbox-add-row";
    const rerollBtn = document.createElement("button");
    rerollBtn.type = "button";
    rerollBtn.className = "secondary";
    rerollBtn.textContent = "Reroll corridor";
    rerollBtn.addEventListener("click", () => {
        controller.rerollSelectedRoomLink();
    });
    actionRow.appendChild(rerollBtn);
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary";
    deleteBtn.textContent = "Delete link";
    deleteBtn.addEventListener("click", () => {
        controller.deleteSelectedRoomLink();
    });
    actionRow.appendChild(deleteBtn);
    body.appendChild(actionRow);
}
/** @param {HTMLElement} body @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller @param {{ mode: string, allowedSide?: number, side?: number } | null} selected @param {{ stampDefaults?: boolean }} [opts] */
function appendPassageEditorFields(body, controller, selected, { stampDefaults = false } = {}) {
    const mode = stampDefaults ? controller.getForcefieldStampMode() : selected.mode;
    appendSelectField(body, "Mode", {
        value: mode,
        options: PASSAGE_MODE_OPTIONS,
        onChange: (value) => {
            if (stampDefaults) controller.setForcefieldStampMode(value);
            else controller.setSelectedForcefieldMode(value);
        },
    });
    if (mode === "oneWay" && !stampDefaults && selected)
        appendSelectField(body, "Allowed side", {
            value: String(selected.allowedSide ?? selected.side),
            options: EDGE_SIDE_OPTIONS,
            onChange: (value) => {
                controller.setSelectedForcefieldAllowedSide(Number(value));
            },
        });
}
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
function appendFactionSelect(parent, { value, onChange }) {
    appendSelectField(parent, "Team", { value: value ?? SANDBOX_DEFAULT_FACTION, options: SANDBOX_FACTION_OPTIONS.map((option) => ({ value: option.id, label: option.label })), onChange });
}
const WALL_PALETTE_SWATCHES = { voxel: "#78716c", rail: "#57534e", forcefield: "#0891b2" };
/** @param {object | null | undefined} asset */
function resolvePropPaletteSwatch(asset) {
    const colors = asset?.visuals?.colors;
    return colors?.bodyInspect ?? colors?.top ?? colors?.side ?? "#64748b";
}
const MAP_GEN_PALETTE_OPTIONS = [
    { key: "gen:cavern", genKind: "cavern", label: "Cavern generation", swatch: "#ff9800", glyph: "Cv" },
    { key: "gen:rail", genKind: "rail", label: "Rail wall generation", swatch: "#e040fb", glyph: "Rw" },
    { key: "gen:erase", genKind: "erase", label: "Wall eraser", swatch: "#f44336", glyph: "Er" },
];
/** @param {string[]} propIds */
function buildPlacePaletteItems(propIds) {
    /** @type {{ key: string, kind: "prop" | "wall" | "gen", label: string, swatch: string, glyph: string, tags: string[], genKind?: "cavern" | "rail" | "erase" }[]} */
    const items = [];
    for (const id of propIds) {
        const asset = getPropAsset(id);
        const label = formatSandboxSpawnLabel(id);
        const key = `prop:${id}`;
        items.push({ key, kind: "prop", label, swatch: resolvePropPaletteSwatch(asset), glyph: label.slice(0, 2), tags: resolvePlacePaletteTags(key, asset) });
    }
    for (const option of WALL_STAMP_OPTIONS) {
        const key = `wall:${option.value}`;
        items.push({ key, kind: "wall", label: option.label, swatch: WALL_PALETTE_SWATCHES[option.value], glyph: option.label.slice(0, 1), tags: resolvePlacePaletteTags(key) });
    }
    for (const option of MAP_GEN_PALETTE_OPTIONS)
        items.push({ key: option.key, kind: "gen", genKind: option.genKind, label: option.label, swatch: option.swatch, glyph: option.glyph, tags: resolvePlacePaletteTags(option.key) });
    items.sort((a, b) => a.label.localeCompare(b.label));
    return items;
}
/** @param {HTMLElement} head @param {string} activeFilter @param {(filter: string) => void} onChange */
function appendPaletteTagFilters(head, activeFilter, onChange) {
    const row = document.createElement("div");
    row.className = "sandbox-palette-filter-group";
    row.setAttribute("role", "radiogroup");
    row.setAttribute("aria-label", "Prop palette filters");
    for (const option of SANDBOX_PALETTE_TAG_FILTERS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sandbox-palette-filter-btn";
        btn.textContent = option.label;
        btn.setAttribute("role", "radio");
        const active = activeFilter === option.id;
        btn.setAttribute("aria-checked", String(active));
        btn.classList.toggle("is-active", active);
        btn.addEventListener("click", () => {
            if (activeFilter !== option.id) onChange(option.id);
        });
        row.appendChild(btn);
    }
    head.appendChild(row);
}
/** @param {HTMLElement} parent @param {{ key: string, label: string, swatch: string, glyph: string }[]} items @param {string} activeKey @param {(key: string) => void} onSelect */
function appendSpawnPaletteGrid(parent, items, activeKey, onSelect) {
    const grid = document.createElement("div");
    grid.className = "spawn-palette-grid";
    for (const item of items) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "spawn-palette-tile";
        btn.setAttribute("aria-pressed", String(item.key === activeKey));
        if (item.key === activeKey) btn.classList.add("is-active");
        const icon = document.createElement("div");
        icon.className = "spawn-palette-icon";
        icon.style.setProperty("--swatch", item.swatch);
        icon.textContent = item.glyph;
        const label = document.createElement("span");
        label.className = "spawn-palette-label";
        label.textContent = item.label;
        btn.append(icon, label);
        btn.addEventListener("click", () => onSelect(item.key));
        grid.appendChild(btn);
    }
    parent.appendChild(grid);
}
/** @param {HTMLElement} body @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller @param {string} spawnId @param {() => void} refreshPanel */
function appendPropPlaceParams(body, controller, spawnId, refreshPanel) {
    const addRow = document.createElement("div");
    addRow.className = "sandbox-add-row";
    const spawnAsset = getPropAsset(spawnId);
    if (spawnAsset && !isGridFloorBeltSpawnAsset(spawnAsset) && !isGridPassagePowerSourceSpawnAsset(spawnAsset) && !isRoomNodeSpawnAsset(spawnAsset) && !isRoomLinkSpawnAsset(spawnAsset))
        appendFactionSelect(addRow, {
            value: controller.getSpawnFaction(),
            onChange: (faction) => {
                controller.setSpawnFaction(faction);
                refreshPanel();
            },
        });
    const spawnBehaviorIds = controller.listSpawnBehaviors();
    if (isSingleWorldPropSpawnAsset(spawnAsset) && spawnBehaviorIds.length > 0)
        appendSelectField(addRow, "Mode", {
            value: controller.getSpawnBehaviorId(),
            options: spawnBehaviorIds.map((behaviorId) => ({ value: behaviorId, label: getSandboxBehaviorLabel(behaviorId) })),
            onChange: (value) => {
                controller.setSpawnBehaviorId(value);
            },
        });
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "secondary";
    addBtn.textContent = "Add at camera";
    addBtn.addEventListener("click", () => controller.spawnAtCameraOrigin());
    if (!isRoomLinkSpawnAsset(spawnAsset)) addRow.appendChild(addBtn);
    body.appendChild(addRow);
    if (isRoomLinkSpawnAsset(spawnAsset)) {
        const fromNodeId = controller.getCorridorLinkWireFromNodeId();
        appendEditorHint(
            body,
            fromNodeId != null
                ? "Source room selected — click the target room. The corridor draws immediately; pick it from Scene to adjust width or reroll."
                : "Click the source room, then the target. One width-1 corridor is placed right away.",
        );
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
        appendEditorHint(body, "Hover the map to preview the footprint. Blocked cells turn red; click only places when every cell is clear.");
        return;
    }
    if (isGridPassagePowerSourceSpawnAsset(spawnAsset))
        appendEditorHint(body, "Add at camera stamps a power source on the grid. Enable Default energized in Selected, or wire a floor button to the source cell.");
}
/**
 * @param {HTMLElement} body
 * @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller
 * @param {{ wallStampMode: string, selectedRail: { col: number, row: number, side: number } | null, selectedVoxelInfo: object | null, selectedRailInfo: object | null }} ctx
 */
function appendWallPlaceParams(body, controller, ctx) {
    const { wallStampMode, selectedVoxelInfo, selectedRailInfo } = ctx;
    appendEditorHint(body, "Click the map to place or select walls. Right-click to delete under the cursor.");
    const addRow = document.createElement("div");
    addRow.className = "sandbox-add-row";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "secondary";
    addBtn.textContent = "Add at camera";
    addBtn.addEventListener("click", () => controller.stampWallAtCameraOrigin());
    addRow.appendChild(addBtn);
    body.appendChild(addRow);
    if (wallStampMode !== "forcefield") {
        const maxHeight = maxWallHeightLevel(controller);
        body.appendChild(
            new SliderControl("Height", 1, maxHeight, 1, controller.getWallHeightLevel(), (val) => {
                controller.setWallHeightLevel(val);
                if (selectedVoxelInfo) controller.setSelectedVoxelWallHeight(val);
                else if (selectedRailInfo) controller.setSelectedRailWallProps(val, selectedRailInfo.thicknessLevel);
            }).element,
        );
    }
    if (wallStampMode === "rail")
        body.appendChild(
            new SliderControl("Thickness", 1, 8, 1, controller.getRailThicknessLevel(), (val) => {
                controller.setRailThicknessLevel(val);
                if (selectedRailInfo) controller.setSelectedRailWallProps(selectedRailInfo.heightLevel, val);
            }).element,
        );
    if (wallStampMode === "forcefield") appendPassageEditorFields(body, controller, null, { stampDefaults: true });
}
/**
 * @param {HTMLElement} body
 * @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller
 * @param {{ selectedVoxelInfo: object | null, selectedRailInfo: object | null, selectedForcefieldInfo: object | null }} ctx
 */
function appendWallSelectedInspector(body, controller, ctx) {
    const { selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo } = ctx;
    if (selectedVoxelInfo) {
        appendEditorHint(body, `Voxel block · height ${selectedVoxelInfo.heightLevel}. Change height below or delete.`);
        body.appendChild(
            new SliderControl("Height", 1, maxWallHeightLevel(controller), 1, selectedVoxelInfo.heightLevel, (val) => {
                controller.setSelectedVoxelWallHeight(val);
            }).element,
        );
        const deleteRow = document.createElement("div");
        deleteRow.className = "sandbox-add-row";
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "secondary";
        deleteBtn.textContent = "Delete voxel";
        deleteBtn.addEventListener("click", () => {
            controller.deleteSelectedWall();
        });
        deleteRow.appendChild(deleteBtn);
        body.appendChild(deleteRow);
        return true;
    }
    if (selectedRailInfo) {
        appendEditorHint(body, `Rail wall · ${selectedRailInfo.sideLabel} · height ${selectedRailInfo.heightLevel}.`);
        appendSelectField(body, "Side", {
            value: String(selectedRailInfo.side),
            options: [0, 1, 2, 3].map((side) => ({ value: String(side), label: formatGridWallEdgeSideLabel(side) })),
            onChange: (value) => {
                controller.setSelectedRailWallSide(Number(value));
            },
        });
        body.appendChild(
            new SliderControl("Height", 1, maxWallHeightLevel(controller), 1, selectedRailInfo.heightLevel, (val) => {
                controller.setSelectedRailWallProps(val, selectedRailInfo.thicknessLevel);
            }).element,
        );
        body.appendChild(
            new SliderControl("Thickness", 1, 8, 1, selectedRailInfo.thicknessLevel, (val) => {
                controller.setSelectedRailWallProps(selectedRailInfo.heightLevel, val);
            }).element,
        );
        const deleteRow = document.createElement("div");
        deleteRow.className = "sandbox-add-row";
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "secondary";
        deleteBtn.textContent = "Delete rail";
        deleteBtn.addEventListener("click", () => {
            controller.deleteSelectedWall();
        });
        deleteRow.appendChild(deleteBtn);
        body.appendChild(deleteRow);
        return true;
    }
    if (selectedForcefieldInfo && controller.isWallPlaceMode()) {
        appendEditorHint(body, `${selectedForcefieldInfo.modeLabel} forcefield · ${selectedForcefieldInfo.sideLabel}. Arms when connected to an energized power source.`);
        appendPassageEditorFields(body, controller, selectedForcefieldInfo);
        const deleteRow = document.createElement("div");
        deleteRow.className = "sandbox-add-row";
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "secondary";
        deleteBtn.textContent = "Delete forcefield";
        deleteBtn.addEventListener("click", () => {
            controller.deleteSelectedWall();
        });
        deleteRow.appendChild(deleteBtn);
        body.appendChild(deleteRow);
        return true;
    }
    return false;
}
/** @param {HTMLElement} container @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller */
function renderSceneJsonPanel(container, controller) {
    appendEditorHint(container, "Copy/paste sandbox layout: props, walls, belts, power sources, forcefields. Replace clears the current sandbox first.");
    const startDemoBtn = document.createElement("button");
    startDemoBtn.type = "button";
    startDemoBtn.className = "secondary";
    startDemoBtn.textContent = "Load start demo";
    const textarea = document.createElement("textarea");
    textarea.className = "editor-export-area";
    textarea.rows = 10;
    textarea.spellcheck = false;
    startDemoBtn.addEventListener("click", () => {
        if (!window.confirm("Replace the current sandbox with the start scene?")) return;
        controller.loadStartScene();
        textarea.value = controller.exportSceneSnapshot();
        controller.sync();
    });
    container.appendChild(startDemoBtn);
    container.appendChild(textarea);
    const row = document.createElement("div");
    row.className = "sandbox-add-row";
    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "secondary";
    exportBtn.textContent = "Export";
    exportBtn.addEventListener("click", () => {
        textarea.value = controller.exportSceneSnapshot();
    });
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "secondary";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
        if (!textarea.value) textarea.value = controller.exportSceneSnapshot();
        await navigator.clipboard.writeText(textarea.value);
    });
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "secondary";
    loadBtn.textContent = "Load (replace)";
    loadBtn.addEventListener("click", () => {
        if (!textarea.value.trim()) return;
        if (!window.confirm("Replace the current sandbox with this JSON?")) return;
        try {
            controller.importSceneSnapshot(textarea.value);
            controller.sync();
        } catch (err) {
            window.alert(err instanceof Error ? err.message : String(err));
        }
    });
    row.append(exportBtn, copyBtn, loadBtn);
    container.appendChild(row);
}
/** @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller */
function maxWallHeightLevel(controller) {
    return controller.getState().worldSurfaces.settings.maxWallHeightLevel;
}
/**
 * @param {HTMLElement} container
 * @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller
 */
export function mountSandboxToyUi(container, controller) {
    const state = controller.getState();
    let corridorWireBootstrapped = false;
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
        if (!corridorWireBootstrapped && activeItem.kind === "prop") {
            const asset = getPropAsset(activeItem.key.slice(5));
            if (isRoomLinkSpawnAsset(asset) && !controller.isCorridorLinkWireActive()) controller.enterCorridorLinkWireMode();
        }
        corridorWireBootstrapped = true;
        const selectedPropIds = new Set(controller.getSelectedPropIds());
        const selectedProp = controller.getSelectedProp();
        const selectedFloorCell = controller.getSelectedFloorCell();
        const selectedFloorBelt = controller.getSelectedFloorBeltInfo();
        const selectedPowerSource = controller.getSelectedPassagePowerSourceInfo();
        const selectedVoxel = controller.getSelectedVoxelCell();
        const selectedRail = controller.getSelectedRailEdge();
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
            else if (activeItem.kind === "wall") appendWallPlaceParams(paramsHost, controller, { wallStampMode, selectedRail, selectedVoxelInfo, selectedRailInfo });
            else appendMapGenEditor(paramsHost, state, activeItem.genKind, refreshPanel);
        });
        appendPinnedSection(container, "selected", "Selected", (body) => {
            if (selectionCount > 1) {
                appendEditorHint(body, `${selectionCount} props selected. Drag on empty space to box-select, or click one prop to select only that.`);
                const deleteRow = document.createElement("div");
                deleteRow.className = "sandbox-add-row";
                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "secondary";
                deleteBtn.textContent = `Delete ${selectionCount} props`;
                deleteBtn.addEventListener("click", () => {
                    controller.deleteSelectedProps();
                });
                deleteRow.appendChild(deleteBtn);
                body.appendChild(deleteRow);
                return;
            }
            if (!selectedProp) {
                if (appendWallSelectedInspector(body, controller, { selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo })) return;
                if (selectedForcefieldInfo) {
                    appendEditorHint(body, `${selectedForcefieldInfo.modeLabel} · ${selectedForcefieldInfo.sideLabel}. Click a laser edge on the map to re-select.`);
                    appendPassageEditorFields(body, controller, selectedForcefieldInfo);
                    const deleteRow = document.createElement("div");
                    deleteRow.className = "sandbox-add-row";
                    const deleteBtn = document.createElement("button");
                    deleteBtn.type = "button";
                    deleteBtn.className = "secondary";
                    deleteBtn.textContent = "Delete forcefield";
                    deleteBtn.addEventListener("click", () => {
                        controller.deleteSelectedWall();
                    });
                    deleteRow.appendChild(deleteBtn);
                    body.appendChild(deleteRow);
                    return;
                }
                if (selectedPowerSource) {
                    appendEditorHint(body, "Passage power source. Wire floor buttons to this cell; lasers arm through connected chains.");
                    const defaultField = document.createElement("label");
                    defaultField.className = "param-field check-inline";
                    const defaultCheckbox = document.createElement("input");
                    defaultCheckbox.type = "checkbox";
                    defaultCheckbox.checked = selectedPowerSource.defaultPowered;
                    defaultCheckbox.addEventListener("change", () => {
                        controller.setSelectedPassagePowerSourceDefaultPowered(defaultCheckbox.checked);
                    });
                    defaultField.append(defaultCheckbox, document.createTextNode(" Default energized"));
                    body.appendChild(defaultField);
                    const deleteRow = document.createElement("div");
                    deleteRow.className = "sandbox-add-row";
                    const deleteBtn = document.createElement("button");
                    deleteBtn.type = "button";
                    deleteBtn.className = "secondary";
                    deleteBtn.textContent = "Delete power source";
                    deleteBtn.addEventListener("click", () => {
                        controller.deleteSelectedFloorCell();
                    });
                    deleteRow.appendChild(deleteBtn);
                    body.appendChild(deleteRow);
                    return;
                }
                if (selectedFloorBelt) {
                    appendEditorHint(
                        body,
                        `${selectedFloorBelt.kindLabel} · facing ${selectedFloorBelt.facingLabel}. Change type, col/row, or rotation below. Move is blocked when the target has a wall or belt.`,
                    );
                    appendSelectField(body, "Type", {
                        value: String(selectedFloorBelt.kind),
                        options: listFloorBeltKindOptions().map((option) => ({ value: String(option.kind), label: option.label })),
                        onChange: (value) => {
                            controller.setSelectedFloorBeltKind(Number(value));
                        },
                    });
                    appendAxisNumberFields(body, {
                        Col: {
                            value: selectedFloorBelt.col,
                            step: 1,
                            onChange: (col) => {
                                controller.moveSelectedFloorBeltTo(col, selectedFloorBelt.row);
                            },
                        },
                        Row: {
                            value: selectedFloorBelt.row,
                            step: 1,
                            onChange: (row) => {
                                controller.moveSelectedFloorBeltTo(selectedFloorBelt.col, row);
                            },
                        },
                    });
                    const rotateRow = document.createElement("div");
                    rotateRow.className = "sandbox-add-row";
                    const rotateLeftBtn = document.createElement("button");
                    rotateLeftBtn.type = "button";
                    rotateLeftBtn.className = "secondary";
                    rotateLeftBtn.textContent = "Rotate left";
                    rotateLeftBtn.addEventListener("click", () => {
                        controller.rotateSelectedFloorBelt(-1);
                    });
                    const rotateRightBtn = document.createElement("button");
                    rotateRightBtn.type = "button";
                    rotateRightBtn.className = "secondary";
                    rotateRightBtn.textContent = "Rotate right";
                    rotateRightBtn.addEventListener("click", () => {
                        controller.rotateSelectedFloorBelt(1);
                    });
                    rotateRow.append(rotateLeftBtn, rotateRightBtn);
                    body.appendChild(rotateRow);
                    const deleteRow = document.createElement("div");
                    deleteRow.className = "sandbox-add-row";
                    const deleteBtn = document.createElement("button");
                    deleteBtn.type = "button";
                    deleteBtn.className = "secondary";
                    deleteBtn.textContent = "Delete belt";
                    deleteBtn.addEventListener("click", () => {
                        controller.deleteSelectedFloorCell();
                    });
                    deleteRow.appendChild(deleteBtn);
                    body.appendChild(deleteRow);
                    return;
                }
                if (selectedRoomNode) {
                    appendEditorHint(
                        body,
                        `${selectedRoomNode.label}. Anchor (${selectedRoomNode.col}, ${selectedRoomNode.row}), size ${selectedRoomNode.width}×${selectedRoomNode.height}. Click the footprint on the map to re-select.`,
                    );
                    appendRoomNodeWireInspector(body, {
                        listLinks: () => controller.listSelectedRoomNodeLinks(),
                        removeLink: (linkId) => controller.removeRoomLinkById(linkId),
                        selectedLinkId: () => controller.getSelectedRoomLinkId(),
                        selectedCorridorIndex: () => controller.getSelectedRoomLinkCorridorIndex(),
                        selectLink: (linkId, corridorIndex) => controller.setSelectedRoomLinkId(linkId, corridorIndex),
                    });
                    const deleteRow = document.createElement("div");
                    deleteRow.className = "sandbox-add-row";
                    const deleteBtn = document.createElement("button");
                    deleteBtn.type = "button";
                    deleteBtn.className = "secondary";
                    deleteBtn.textContent = "Delete room node";
                    deleteBtn.addEventListener("click", () => {
                        controller.deleteSelectedRoomNode();
                    });
                    deleteRow.appendChild(deleteBtn);
                    body.appendChild(deleteRow);
                    return;
                }
                if (selectedRoomLink) {
                    appendRoomLinkCorridorInspector(body, selectedRoomLink, controller);
                    return;
                }
                appendEditorHint(body, "Select an item from Scene, or pick from Props to place on the map.");
                return;
            }
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
            if (behaviorIds.length > 0)
                appendSelectField(body, "Mode", {
                    value: controller.getSelectedBehaviorId(),
                    options: behaviorIds.map((behaviorId) => ({ value: behaviorId, label: getSandboxBehaviorLabel(behaviorId) })),
                    onChange: (value) => {
                        controller.setSelectedBehaviorId(value);
                    },
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
            const focusField = document.createElement("label");
            focusField.className = "param-field check-inline";
            const focusCheckbox = document.createElement("input");
            focusCheckbox.type = "checkbox";
            focusCheckbox.checked = controller.isCameraTarget(selectedProp);
            focusCheckbox.addEventListener("change", () => {
                controller.setCameraTarget(focusCheckbox.checked, selectedProp);
            });
            focusField.append(focusCheckbox, document.createTextNode(" Focus"));
            body.appendChild(focusField);
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
    controller.setUiSync(refreshPanel);
    refreshPanel();
    return () => {
        controller.setUiSync(null);
        container.innerHTML = "";
    };
}
/**
 * @param {HTMLElement} container
 * @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller
 */
export function mountSceneJsonUi(container, controller) {
    renderSceneJsonPanel(container, controller);
    return () => {
        container.innerHTML = "";
    };
}
