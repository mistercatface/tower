import { getPropAsset, getWorldPropDefinitions, formatSandboxSpawnLabel } from "../../../Libraries/Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, SANDBOX_FACTION_OPTIONS, formatSandboxFactionLabel, resolveSandboxFaction } from "../../../Libraries/Combat/sandboxTargeting.js";
import {
    getSandboxBehaviorLabel,
    isSandboxEquippable,
    isSandboxSpawnable,
    isGridFloorBeltSpawnAsset,
    isGridPassagePowerSourceSpawnAsset,
    isSingleWorldPropSpawnAsset,
    listFloorBeltKindOptions,
} from "../../../Libraries/Sandbox/sandboxCapabilities.js";
import { isSpawnerProp, listSpawnerSpawnPropIds, resolveSpawnerPropId } from "../../../Libraries/Sandbox/spawnerConfig.js";
import { appendSandboxWorldPropInspectorFields, appendButtonWireInspector } from "../../../Libraries/Sandbox/sandboxWorldPropInspector.js";
import { isButtonEntity } from "../../../Libraries/Sandbox/buttonInput.js";
import { renderSandboxEquipPanel } from "../../../Libraries/Sandbox/sandboxEquipPanel.js";
import { SANDBOX_PATH_VISUAL_LABELS, SANDBOX_PATH_VISUAL_OPTIONS } from "../../../Libraries/Sandbox/sandboxPathVisual.js";
import { SANDBOX_PROP_VISUAL_LABELS, SANDBOX_PROP_VISUAL_OPTIONS } from "../../../Libraries/Sandbox/sandboxPropVisual.js";
import { formatGridWallEdgeSideLabel } from "../../../Libraries/Sandbox/gridWallEdit.js";
import { portalAccessDefaultAllowedSide } from "../../../Libraries/Spatial/grid/portalAccess.js";
import { appendAxisNumberFields, appendEditorHint, appendEditorSubhead, appendInstanceList, appendSelectField } from "../../../Libraries/UI/paramFields.js";
import { SliderControl } from "../../../Libraries/UI/controls/SliderControl.js";
const WALL_STAMP_OPTIONS = [
    { value: "voxel", label: "Voxel block" },
    { value: "rail", label: "Rail wall" },
    { value: "forcefield", label: "Forcefield" },
    { value: "portal", label: "Portal" },
];
const PASSAGE_MODE_OPTIONS = [
    { value: "solid", label: "Solid — wall when powered" },
    { value: "oneWay", label: "One-way — block against allowed side" },
    { value: "tripwire", label: "Tripwire — sensor, never blocks" },
];
const PORTAL_CONNECTION_OPTIONS = [
    { value: "shared", label: "Shared — both ways (⇄)" },
    { value: "fromSelf", label: "One-way — this portal → partner (→)" },
    { value: "fromPartner", label: "One-way — partner → this portal (←)" },
];
const EDGE_SIDE_OPTIONS = [
    { value: "0", label: formatGridWallEdgeSideLabel(0) },
    { value: "1", label: formatGridWallEdgeSideLabel(1) },
    { value: "2", label: formatGridWallEdgeSideLabel(2) },
    { value: "3", label: formatGridWallEdgeSideLabel(3) },
];
/** @param {number} ownerSide */
function portalMouthSideOptions(ownerSide) {
    const mirror = portalAccessDefaultAllowedSide(ownerSide);
    const neighborLabel = ownerSide === 0 ? "North neighbor" : ownerSide === 1 ? "East neighbor" : ownerSide === 2 ? "South neighbor" : "West neighbor";
    return [
        { value: String(mirror), label: "Owner cell (stamped edge)" },
        { value: String(ownerSide), label: `${neighborLabel} (across edge)` },
    ];
}
/** @param {HTMLElement} body @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller @param {{ mode: string, allowedSide?: number, side?: number } | null} selected @param {{ stampDefaults?: boolean, onChange: () => void }} opts */
function appendPassageEditorFields(body, controller, selected, { stampDefaults = false, onChange }) {
    const mode = stampDefaults ? controller.getForcefieldStampMode() : selected.mode;
    appendSelectField(body, "Mode", {
        value: mode,
        options: PASSAGE_MODE_OPTIONS,
        onChange: (value) => {
            if (stampDefaults) controller.setForcefieldStampMode(value);
            else controller.setSelectedForcefieldMode(value);
            onChange();
        },
    });
    if (mode === "oneWay" && !stampDefaults && selected)
        appendSelectField(body, "Allowed side", {
            value: String(selected.allowedSide ?? selected.side),
            options: EDGE_SIDE_OPTIONS,
            onChange: (value) => {
                controller.setSelectedForcefieldAllowedSide(Number(value));
                onChange();
            },
        });
}
/** @param {HTMLElement} body @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller @param {{ mouthAllowedSide?: number, side?: number, linked?: boolean, partner?: { col: number, row: number, side: number } | null, onNetwork?: boolean, connection?: string, connectionLabel?: string } | null} selected @param {{ stampDefaults?: boolean, ownerSide: number, linkTargets?: { col: number, row: number, side: number, label: string }[], onChange: () => void }} opts */
function appendPortalEditorFields(body, controller, selected, { stampDefaults = false, ownerSide, linkTargets = [], onChange }) {
    if (stampDefaults) {
        appendSelectField(body, "Portal mouth", {
            value: controller.getPortalStampMouthNeighbor() ? String(ownerSide) : String(portalAccessDefaultAllowedSide(ownerSide)),
            options: portalMouthSideOptions(ownerSide),
            onChange: (value) => {
                controller.setPortalStampMouthNeighbor(Number(value) === ownerSide);
                onChange();
            },
        });
        appendEditorHint(body, "One mouth cell per edge; the other side is always a solid wall. Connection direction is set after linking.");
        return;
    }
    if (!selected) return;
    appendSelectField(body, "Portal mouth", {
        value: String(selected.mouthAllowedSide ?? portalAccessDefaultAllowedSide(ownerSide)),
        options: portalMouthSideOptions(ownerSide),
        onChange: (value) => {
            controller.setSelectedPortalMouthSide(Number(value));
            onChange();
        },
    });
    if (!selected.onNetwork) appendEditorHint(body, "Off network — extend a powered laser chain from a power source to this edge.");
    else if (!selected.linked)
        appendEditorHint(body, linkTargets.length > 0 ? "On network. Link to another portal on the same laser chain below." : "On network, but no other powered portal shares this chain yet.");
    if (selected.linked) {
        appendSelectField(body, "Connection", {
            value: selected.connection ?? "shared",
            options: PORTAL_CONNECTION_OPTIONS,
            onChange: (value) => {
                controller.setSelectedPortalConnection(value);
                onChange();
            },
        });
        appendEditorHint(body, `${selected.connectionLabel}. Shared = green both ends; one-way = green depart, orange receive.`);
    }
    if (selected.onNetwork && linkTargets.length > 0)
        appendSelectField(body, "Link partner", {
            value: selected.linked && selected.partner ? `${selected.partner.col},${selected.partner.row},${selected.partner.side}` : "",
            options: [{ value: "", label: "Choose portal…" }, ...linkTargets.map((t) => ({ value: `${t.col},${t.row},${t.side}`, label: t.label }))],
            onChange: (value) => {
                if (!value) return;
                const [col, row, side] = value.split(",").map(Number);
                controller.linkSelectedPortalTo(col, row, side);
                onChange();
            },
        });
    if (selected.linked) {
        const unlinkRow = document.createElement("div");
        unlinkRow.className = "sandbox-add-row";
        const unlinkBtn = document.createElement("button");
        unlinkBtn.type = "button";
        unlinkBtn.className = "secondary";
        unlinkBtn.textContent = "Unlink partner";
        unlinkBtn.addEventListener("click", () => {
            controller.unlinkSelectedPortal();
            onChange();
        });
        unlinkRow.appendChild(unlinkBtn);
        body.appendChild(unlinkRow);
    }
}
function readOpenSections(root) {
    const open = new Set();
    for (const el of root.querySelectorAll("details[data-sandbox-section]")) if (el.open) open.add(el.dataset.sandboxSection);
    return open;
}
/** @param {HTMLElement} parent @param {string} id @param {string} title @param {boolean} defaultOpen @param {(body: HTMLElement) => void} build */
function appendSection(parent, id, title, defaultOpen, build) {
    const details = document.createElement("details");
    details.className = "editor-block";
    details.dataset.sandboxSection = id;
    details.open = defaultOpen;
    const summary = document.createElement("summary");
    summary.textContent = title;
    details.appendChild(summary);
    const body = document.createElement("div");
    build(body);
    details.appendChild(body);
    parent.appendChild(details);
    return details;
}
/** @param {HTMLElement} parent @param {string} id @param {string} title @param {(body: HTMLElement) => void} build */
function appendPinnedSection(parent, id, title, build) {
    const block = document.createElement("div");
    block.className = "editor-block editor-block-pinned";
    block.dataset.sandboxSection = id;
    const head = document.createElement("div");
    head.className = "editor-block-title";
    head.textContent = title;
    block.appendChild(head);
    const body = document.createElement("div");
    build(body);
    block.appendChild(body);
    parent.appendChild(block);
    return block;
}
function appendFactionSelect(parent, { value, onChange }) {
    appendSelectField(parent, "Team", { value: value ?? SANDBOX_DEFAULT_FACTION, options: SANDBOX_FACTION_OPTIONS.map((option) => ({ value: option.id, label: option.label })), onChange });
}
const WALL_PALETTE_SWATCHES = { voxel: "#78716c", rail: "#57534e", forcefield: "#0891b2", portal: "#9333ea" };
/** @param {object | null | undefined} asset */
function resolvePropPaletteSwatch(asset) {
    const colors = asset?.visuals?.colors;
    return colors?.bodyInspect ?? colors?.top ?? colors?.side ?? "#64748b";
}
/** @param {string[]} propIds */
function buildPlacePaletteItems(propIds) {
    const items = [];
    for (const id of propIds) {
        const asset = getPropAsset(id);
        const label = formatSandboxSpawnLabel(id);
        items.push({ key: `prop:${id}`, kind: "prop", label, swatch: resolvePropPaletteSwatch(asset), glyph: label.slice(0, 2) });
    }
    for (const option of WALL_STAMP_OPTIONS)
        items.push({ key: `wall:${option.value}`, kind: "wall", label: option.label, swatch: WALL_PALETTE_SWATCHES[option.value], glyph: option.label.slice(0, 1) });
    return items;
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
        icon.style.background = item.swatch;
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
/** @param {HTMLElement} body @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller @param {string} spawnId @param {() => void} onChange */
function appendPropPlaceParams(body, controller, spawnId, onChange) {
    const addRow = document.createElement("div");
    addRow.className = "sandbox-add-row";
    const spawnAsset = getPropAsset(spawnId);
    if (spawnAsset && !isGridFloorBeltSpawnAsset(spawnAsset) && !isGridPassagePowerSourceSpawnAsset(spawnAsset))
        appendFactionSelect(addRow, {
            value: controller.getSpawnFaction(),
            onChange: (faction) => {
                controller.setSpawnFaction(faction);
                onChange();
            },
        });
    const spawnBehaviorIds = controller.listSpawnBehaviors();
    if (isSingleWorldPropSpawnAsset(spawnAsset) && spawnBehaviorIds.length > 0)
        appendSelectField(addRow, "Mode", {
            value: controller.getSpawnBehaviorId(),
            options: spawnBehaviorIds.map((behaviorId) => ({ value: behaviorId, label: getSandboxBehaviorLabel(behaviorId) })),
            onChange: (value) => {
                controller.setSpawnBehaviorId(value);
                onChange();
            },
        });
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "secondary";
    addBtn.textContent = "Add at camera";
    addBtn.addEventListener("click", () => controller.spawnAtCameraOrigin());
    addRow.appendChild(addBtn);
    body.appendChild(addRow);
    appendEditorHint(body, "Click the map to place, or use Add at camera.");
    if (isGridPassagePowerSourceSpawnAsset(spawnAsset))
        appendEditorHint(body, "Add at camera stamps a power source on the grid. Enable Default energized in Selected, or wire a floor button to the source cell.");
}
/**
 * @param {HTMLElement} body
 * @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller
 * @param {() => void} onChange
 * @param {{ wallStampMode: string, selectedRail: { col: number, row: number, side: number } | null, selectedVoxelInfo: object | null, selectedRailInfo: object | null, selectedPortalInfo: object | null }} ctx
 */
function appendWallPlaceParams(body, controller, onChange, ctx) {
    const { wallStampMode, selectedRail, selectedVoxelInfo, selectedRailInfo, selectedPortalInfo } = ctx;
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
    if (wallStampMode !== "forcefield" && wallStampMode !== "portal") {
        const maxHeight = maxWallHeightLevel(controller);
        body.appendChild(
            new SliderControl("Height", 1, maxHeight, 1, controller.getWallHeightLevel(), (val) => {
                controller.setWallHeightLevel(val);
                if (selectedVoxelInfo) controller.setSelectedVoxelWallHeight(val);
                else if (selectedRailInfo) controller.setSelectedRailWallProps(val, selectedRailInfo.thicknessLevel);
                onChange();
            }).element,
        );
    }
    if (wallStampMode === "rail")
        body.appendChild(
            new SliderControl("Thickness", 1, 8, 1, controller.getRailThicknessLevel(), (val) => {
                controller.setRailThicknessLevel(val);
                if (selectedRailInfo) controller.setSelectedRailWallProps(selectedRailInfo.heightLevel, val);
                onChange();
            }).element,
        );
    if (wallStampMode === "forcefield") appendPassageEditorFields(body, controller, null, { stampDefaults: true, onChange });
    if (wallStampMode === "portal") appendPortalEditorFields(body, controller, null, { stampDefaults: true, ownerSide: selectedRail?.side ?? selectedPortalInfo?.side ?? 1, onChange });
}
/**
 * @param {HTMLElement} body
 * @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller
 * @param {() => void} onChange
 * @param {{ selectedVoxelInfo: object | null, selectedRailInfo: object | null, selectedForcefieldInfo: object | null, selectedPortalInfo: object | null, portalLinkTargets: { col: number, row: number, side: number, label: string }[] }} ctx
 */
function appendWallSelectedInspector(body, controller, onChange, ctx) {
    const { selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo, selectedPortalInfo, portalLinkTargets } = ctx;
    if (selectedVoxelInfo) {
        appendEditorHint(body, `Voxel block · height ${selectedVoxelInfo.heightLevel}. Change height below or delete.`);
        body.appendChild(
            new SliderControl("Height", 1, maxWallHeightLevel(controller), 1, selectedVoxelInfo.heightLevel, (val) => {
                controller.setSelectedVoxelWallHeight(val);
                onChange();
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
            onChange();
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
                onChange();
            },
        });
        body.appendChild(
            new SliderControl("Height", 1, maxWallHeightLevel(controller), 1, selectedRailInfo.heightLevel, (val) => {
                controller.setSelectedRailWallProps(val, selectedRailInfo.thicknessLevel);
                onChange();
            }).element,
        );
        body.appendChild(
            new SliderControl("Thickness", 1, 8, 1, selectedRailInfo.thicknessLevel, (val) => {
                controller.setSelectedRailWallProps(selectedRailInfo.heightLevel, val);
                onChange();
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
            onChange();
        });
        deleteRow.appendChild(deleteBtn);
        body.appendChild(deleteRow);
        return true;
    }
    if (selectedPortalInfo) {
        appendEditorHint(body, `Portal · ${selectedPortalInfo.sideLabel}. Mouth cell has the laser strip; opposite side is solid wall. Link on the same powered laser chain.`);
        appendPortalEditorFields(body, controller, selectedPortalInfo, { ownerSide: selectedPortalInfo.side, linkTargets: portalLinkTargets, onChange });
        const deleteRow = document.createElement("div");
        deleteRow.className = "sandbox-add-row";
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "secondary";
        deleteBtn.textContent = "Delete portal";
        deleteBtn.addEventListener("click", () => {
            controller.deleteSelectedWall();
            onChange();
        });
        deleteRow.appendChild(deleteBtn);
        body.appendChild(deleteRow);
        return true;
    }
    if (selectedForcefieldInfo && controller.isWallPlaceMode()) {
        appendEditorHint(body, `${selectedForcefieldInfo.modeLabel} forcefield · ${selectedForcefieldInfo.sideLabel}. Arms when connected to an energized power source.`);
        appendPassageEditorFields(body, controller, selectedForcefieldInfo, { onChange });
        const deleteRow = document.createElement("div");
        deleteRow.className = "sandbox-add-row";
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "secondary";
        deleteBtn.textContent = "Delete forcefield";
        deleteBtn.addEventListener("click", () => {
            controller.deleteSelectedWall();
            onChange();
        });
        deleteRow.appendChild(deleteBtn);
        body.appendChild(deleteRow);
        return true;
    }
    return false;
}
/** @param {HTMLElement} container @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller @param {() => void} onChange */
function renderSceneJsonPanel(container, controller, onChange) {
    appendEditorHint(container, "Copy/paste sandbox layout: props, walls, belts, power sources, forcefields, portals. Replace clears the current sandbox first.");
    const startDemoBtn = document.createElement("button");
    startDemoBtn.type = "button";
    startDemoBtn.className = "secondary";
    startDemoBtn.textContent = "Load start demo";
    const textarea = document.createElement("textarea");
    textarea.className = "editor-export-area";
    textarea.rows = 10;
    textarea.spellcheck = false;
    startDemoBtn.addEventListener("click", () => {
        if (!window.confirm("Replace the current sandbox with the portal/power start demo?")) return;
        controller.loadStartScene();
        textarea.value = controller.exportSceneSnapshot();
        onChange();
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
            onChange();
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
 * @param {() => void} onChange
 */
export function mountSandboxToyUi(container, controller, onChange) {
    const propIds = Object.keys(getWorldPropDefinitions())
        .filter((id) => isSandboxSpawnable(getPropAsset(id)))
        .sort();
    let isFirstRender = true;
    const render = () => {
        const openSections = readOpenSections(container);
        container.innerHTML = "";
        const paletteItems = buildPlacePaletteItems(propIds);
        if (paletteItems.length === 0) {
            appendEditorHint(container, "No sandbox spawn options loaded");
            return;
        }
        let paletteKey = controller.getPlacePaletteKey();
        if (!paletteItems.some((item) => item.key === paletteKey)) {
            paletteKey = paletteItems[0].key;
            controller.setPlacePaletteKey(paletteKey);
        }
        const activeItem = paletteItems.find((item) => item.key === paletteKey) ?? paletteItems[0];
        const sectionOpen = (id, fallback = true) => {
            if (openSections.size > 0) return openSections.has(id);
            return isFirstRender ? fallback : openSections.has(id);
        };
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
        const selectedPortalInfo = controller.getSelectedPortalInfo();
        const portalLinkTargets = selectedPortalInfo ? controller.listPortalLinkTargets() : [];
        const wallStampMode = controller.getWallStampMode();
        const selectionCount = selectedPropIds.size;
        appendSection(container, "spawn", "Spawn", sectionOpen("spawn"), (body) => {
            appendSpawnPaletteGrid(body, paletteItems, paletteKey, (key) => {
                controller.setPlacePaletteKey(key);
                onChange();
            });
            const paramsHost = document.createElement("div");
            paramsHost.className = "spawn-palette-params";
            body.appendChild(paramsHost);
            if (activeItem.kind === "prop") appendPropPlaceParams(paramsHost, controller, activeItem.key.slice(5), onChange);
            else appendWallPlaceParams(paramsHost, controller, onChange, { wallStampMode, selectedRail, selectedVoxelInfo, selectedRailInfo, selectedPortalInfo });
        });
        const placed = controller.listPlacedProps();
        const floorBelts = controller.listPlacedFloorBelts();
        const powerSources = controller.listPlacedPassagePowerSources();
        const forcefields = controller.listPlacedForcefields();
        const voxelWalls = controller.listPlacedVoxelWalls();
        const railWalls = controller.listPlacedRailWalls();
        const portals = controller.listPlacedPortals();
        appendPinnedSection(container, "scene", "Scene", (body) => {
            appendEditorSubhead(body, "Props");
            appendInstanceList(
                body,
                placed.map((entry) => ({
                    label: `${entry.label} · ${formatSandboxFactionLabel(entry.faction)}`,
                    selected: selectedPropIds.has(entry.id),
                    onSelect: () => {
                        controller.setPlacePaletteKey(`prop:${entry.type}`);
                        controller.setSelectedPropId(entry.id);
                        onChange();
                    },
                    onDelete: () => controller.deletePropById(entry.id),
                })),
                "No props placed yet.",
            );
            appendEditorSubhead(body, "Conveyor belts");
            appendInstanceList(
                body,
                floorBelts.map((entry) => ({
                    label: entry.label,
                    selected: selectedFloorCell?.col === entry.col && selectedFloorCell.row === entry.row,
                    onSelect: () => controller.setSelectedFloorCell(entry.col, entry.row),
                    onDelete: () => {
                        controller.setSelectedFloorCell(entry.col, entry.row);
                        controller.deleteSelectedFloorCell();
                    },
                })),
                "No conveyor belts placed yet.",
            );
            appendEditorSubhead(body, "Power sources");
            appendInstanceList(
                body,
                powerSources.map((entry) => ({
                    label: entry.label,
                    selected: selectedFloorCell?.col === entry.col && selectedFloorCell.row === entry.row,
                    onSelect: () => controller.setSelectedFloorCell(entry.col, entry.row),
                    onDelete: () => {
                        controller.setSelectedFloorCell(entry.col, entry.row);
                        controller.deleteSelectedFloorCell();
                    },
                })),
                "No power sources placed yet.",
            );
            appendEditorSubhead(body, "Voxel blocks");
            appendInstanceList(
                body,
                voxelWalls.map((entry) => ({
                    label: entry.label,
                    selected: selectedVoxel?.col === entry.col && selectedVoxel.row === entry.row,
                    onSelect: () => {
                        controller.setPlacePaletteKey("wall:voxel");
                        controller.setSelectedVoxelCell(entry.col, entry.row);
                        onChange();
                    },
                    onDelete: () => {
                        controller.setSelectedVoxelCell(entry.col, entry.row);
                        controller.deleteSelectedWall();
                        onChange();
                    },
                })),
                "No voxel walls placed yet.",
            );
            appendEditorSubhead(body, "Rail walls");
            appendInstanceList(
                body,
                railWalls.map((entry) => ({
                    label: entry.label,
                    selected: selectedRail?.col === entry.col && selectedRail.row === entry.row && selectedRail.side === entry.side,
                    onSelect: () => {
                        controller.setPlacePaletteKey(`wall:rail`);
                        controller.setSelectedRailEdge(entry.col, entry.row, entry.side);
                        onChange();
                    },
                    onDelete: () => {
                        controller.setSelectedRailEdge(entry.col, entry.row, entry.side);
                        controller.deleteSelectedWall();
                        onChange();
                    },
                })),
                "No rail walls placed yet.",
            );
            appendEditorSubhead(body, "Forcefields");
            appendInstanceList(
                body,
                forcefields.map((entry) => ({
                    label: entry.label,
                    selected: selectedForcefieldInfo?.col === entry.col && selectedForcefieldInfo.row === entry.row && selectedForcefieldInfo.side === entry.side,
                    onSelect: () => {
                        controller.setPlacePaletteKey(`wall:forcefield`);
                        controller.setSelectedRailEdge(entry.col, entry.row, entry.side);
                        onChange();
                    },
                    onDelete: () => {
                        controller.setSelectedRailEdge(entry.col, entry.row, entry.side);
                        controller.deleteSelectedWall();
                        onChange();
                    },
                })),
                "No forcefields placed yet.",
            );
            appendEditorSubhead(body, "Portals");
            appendInstanceList(
                body,
                portals.map((entry) => ({
                    label: entry.label,
                    selected: selectedPortalInfo?.col === entry.col && selectedPortalInfo.row === entry.row && selectedPortalInfo.side === entry.side,
                    onSelect: () => {
                        controller.setPlacePaletteKey(`wall:portal`);
                        controller.setSelectedRailEdge(entry.col, entry.row, entry.side);
                        onChange();
                    },
                    onDelete: () => {
                        controller.setSelectedRailEdge(entry.col, entry.row, entry.side);
                        controller.deleteSelectedWall();
                        onChange();
                    },
                })),
                "No portals placed yet.",
            );
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
                    onChange();
                });
                deleteRow.appendChild(deleteBtn);
                body.appendChild(deleteRow);
                return;
            }
            if (!selectedProp) {
                if (appendWallSelectedInspector(body, controller, onChange, { selectedVoxelInfo, selectedRailInfo, selectedForcefieldInfo, selectedPortalInfo, portalLinkTargets })) return;
                if (selectedForcefieldInfo) {
                    appendEditorHint(body, `${selectedForcefieldInfo.modeLabel} · ${selectedForcefieldInfo.sideLabel}. Click a laser edge on the map to re-select.`);
                    appendPassageEditorFields(body, controller, selectedForcefieldInfo, { onChange });
                    const deleteRow = document.createElement("div");
                    deleteRow.className = "sandbox-add-row";
                    const deleteBtn = document.createElement("button");
                    deleteBtn.type = "button";
                    deleteBtn.className = "secondary";
                    deleteBtn.textContent = "Delete forcefield";
                    deleteBtn.addEventListener("click", () => {
                        controller.deleteSelectedWall();
                        onChange();
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
                        onChange();
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
                        onChange();
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
                            onChange();
                        },
                    });
                    appendAxisNumberFields(body, {
                        Col: {
                            value: selectedFloorBelt.col,
                            step: 1,
                            onChange: (col) => {
                                controller.moveSelectedFloorBeltTo(col, selectedFloorBelt.row);
                                onChange();
                            },
                        },
                        Row: {
                            value: selectedFloorBelt.row,
                            step: 1,
                            onChange: (row) => {
                                controller.moveSelectedFloorBeltTo(selectedFloorBelt.col, row);
                                onChange();
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
                        onChange();
                    });
                    const rotateRightBtn = document.createElement("button");
                    rotateRightBtn.type = "button";
                    rotateRightBtn.className = "secondary";
                    rotateRightBtn.textContent = "Rotate right";
                    rotateRightBtn.addEventListener("click", () => {
                        controller.rotateSelectedFloorBelt(1);
                        onChange();
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
                        onChange();
                    });
                    deleteRow.appendChild(deleteBtn);
                    body.appendChild(deleteRow);
                    return;
                }
                appendEditorHint(body, "Select an item from Scene, or pick from the Spawn grid to place on the map.");
                return;
            }
            const behaviorIds = controller.listSelectedBehaviors();
            appendFactionSelect(body, {
                value: resolveSandboxFaction(selectedProp),
                onChange: (faction) => {
                    selectedProp.faction = faction;
                    controller.sync?.();
                    onChange();
                },
            });
            appendSandboxWorldPropInspectorFields(body, selectedProp, { state: controller.getState(), sync: () => controller.sync?.(), onChange });
            if (isButtonEntity(selectedProp))
                appendButtonWireInspector(
                    body,
                    {
                        listLinks: () => controller.listSelectedButtonLinks(),
                        isWireActive: () => controller.isButtonWireLinkActive(),
                        startWire: () => controller.startButtonWireLink(),
                        cancelWire: () => controller.cancelButtonWireLink(),
                        clearLinks: () => controller.clearSelectedButtonLinks(),
                        removeLink: (target) => controller.removeSelectedButtonLink(target),
                    },
                    onChange,
                );
            if (behaviorIds.length > 0)
                appendSelectField(body, "Mode", {
                    value: controller.getSelectedBehaviorId(),
                    options: behaviorIds.map((behaviorId) => ({ value: behaviorId, label: getSandboxBehaviorLabel(behaviorId) })),
                    onChange: (value) => {
                        controller.setSelectedBehaviorId(value);
                        onChange();
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
                            controller.sync?.();
                            onChange();
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
                onChange();
            });
            focusField.append(focusCheckbox, document.createTextNode(" Focus"));
            body.appendChild(focusField);
            appendSelectField(body, "Path visual", {
                value: controller.getPathVisual(selectedProp),
                options: SANDBOX_PATH_VISUAL_OPTIONS.map((optionId) => ({ value: optionId, label: SANDBOX_PATH_VISUAL_LABELS[optionId] })),
                onChange: (value) => {
                    controller.setPathVisual(value, selectedProp);
                    onChange();
                },
            });
            appendSelectField(body, "Visual", {
                value: controller.getPropVisual(selectedProp),
                options: SANDBOX_PROP_VISUAL_OPTIONS.map((optionId) => ({ value: optionId, label: SANDBOX_PROP_VISUAL_LABELS[optionId] })),
                onChange: (value) => {
                    controller.setPropVisual(value, selectedProp);
                    onChange();
                },
            });
            if (isSandboxEquippable(getPropAsset(selectedProp.type))) {
                const equipPanel = document.createElement("div");
                equipPanel.className = "sandbox-equip-panel";
                renderSandboxEquipPanel(equipPanel, selectedProp, () => {
                    controller.sync?.();
                    onChange();
                });
                body.appendChild(equipPanel);
            }
        });
        isFirstRender = false;
    };
    controller.setUiSync(render);
    render();
    return () => {
        controller.setUiSync(null);
        container.innerHTML = "";
    };
}
/**
 * @param {HTMLElement} container
 * @param {ReturnType<import("../../../Libraries/Sandbox/createSandboxController.js").createSandboxController>} controller
 * @param {() => void} onChange
 */
export function mountSceneJsonUi(container, controller, onChange) {
    renderSceneJsonPanel(container, controller, onChange);
    return () => {
        container.innerHTML = "";
    };
}
