import { getPropAsset, getWorldPropDefinitions, formatSandboxSpawnLabel } from "../../../Libraries/Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, SANDBOX_FACTION_OPTIONS, formatSandboxFactionLabel, resolveSandboxFaction } from "../../../Libraries/Combat/sandboxTargeting.js";
import {
    getSandboxBehaviorLabel,
    isSandboxEquippable,
    isSandboxSpawnable,
    isGridFloorBeltSpawnAsset,
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
import { appendAxisNumberFields, appendEditorHint, appendEditorSubhead, appendInstanceList, appendSelectField } from "../../../Libraries/UI/paramFields.js";
import { SliderControl } from "../../../Libraries/UI/controls/SliderControl.js";
const WALL_STAMP_OPTIONS = [
    { value: "voxel", label: "Voxel block" },
    { value: "rail", label: "Rail wall" },
];
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
function appendFactionSelect(parent, { value, onChange }) {
    appendSelectField(parent, "Team", { value: value ?? SANDBOX_DEFAULT_FACTION, options: SANDBOX_FACTION_OPTIONS.map((option) => ({ value: option.id, label: option.label })), onChange });
}
/** @param {string[]} propIds */
function buildSpawnOptions(propIds) {
    return propIds.map((id) => ({ value: id, label: formatSandboxSpawnLabel(id) }));
}
function appendPanelTabs(container, controller, onChange) {
    const row = document.createElement("div");
    row.className = "sandbox-panel-tabs";
    row.setAttribute("role", "tablist");
    for (const [tab, label] of [
        ["props", "Props"],
        ["walls", "Walls"],
    ]) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sandbox-panel-tab";
        btn.textContent = label;
        btn.setAttribute("role", "tab");
        if (controller.getEditorPanelTab() === tab) btn.classList.add("is-active");
        btn.addEventListener("click", () => {
            controller.setEditorPanelTab(tab);
            onChange();
        });
        row.appendChild(btn);
    }
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
 * @param {(id: string, fallback?: boolean) => boolean} sectionOpen
 */
function renderWallsPanel(container, controller, onChange, sectionOpen) {
    const selectedVoxel = controller.getSelectedVoxelCell();
    const selectedRail = controller.getSelectedRailEdge();
    const selectedVoxelInfo = controller.getSelectedVoxelWallInfo();
    const selectedRailInfo = controller.getSelectedRailWallInfo();
    const hasWallSelection = selectedVoxel != null || selectedRail != null;
    const toolsRow = document.createElement("div");
    toolsRow.className = "sandbox-add-row";
    const ringsField = document.createElement("label");
    ringsField.className = "param-field check-inline";
    const ringsCheckbox = document.createElement("input");
    ringsCheckbox.type = "checkbox";
    ringsCheckbox.checked = controller.getShowSelectionRings();
    ringsCheckbox.addEventListener("change", () => {
        controller.setShowSelectionRings(ringsCheckbox.checked);
        onChange();
    });
    ringsField.append(ringsCheckbox, document.createTextNode(" Selection rings"));
    toolsRow.appendChild(ringsField);
    const deleteSelectedBtn = document.createElement("button");
    deleteSelectedBtn.type = "button";
    deleteSelectedBtn.className = "secondary";
    deleteSelectedBtn.disabled = !hasWallSelection;
    deleteSelectedBtn.textContent = "Delete selected";
    deleteSelectedBtn.addEventListener("click", () => {
        controller.deleteSelectedWall();
        onChange();
    });
    toolsRow.appendChild(deleteSelectedBtn);
    container.appendChild(toolsRow);
    appendSection(container, "wall-spawn", "Place", sectionOpen("wall-spawn"), (body) => {
        appendEditorHint(body, "Click the map to place or select walls. Right-click to delete under the cursor.");
        const addRow = document.createElement("div");
        addRow.className = "sandbox-add-row";
        appendSelectField(addRow, "Type", {
            value: controller.getWallStampMode(),
            options: WALL_STAMP_OPTIONS,
            onChange: (value) => {
                controller.setWallStampMode(value);
                onChange();
            },
        });
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "secondary";
        addBtn.textContent = "Add at camera";
        addBtn.addEventListener("click", () => controller.stampWallAtCameraOrigin());
        addRow.appendChild(addBtn);
        body.appendChild(addRow);
        const maxHeight = maxWallHeightLevel(controller);
        body.appendChild(
            new SliderControl("Height", 1, maxHeight, 1, controller.getWallHeightLevel(), (val) => {
                controller.setWallHeightLevel(val);
                if (selectedVoxelInfo) controller.setSelectedVoxelWallHeight(val);
                else if (selectedRailInfo) controller.setSelectedRailWallProps(val, selectedRailInfo.thicknessLevel);
                onChange();
            }).element,
        );
        if (controller.getWallStampMode() === "rail")
            body.appendChild(
                new SliderControl("Thickness", 1, 8, 1, controller.getRailThicknessLevel(), (val) => {
                    controller.setRailThicknessLevel(val);
                    if (selectedRailInfo) controller.setSelectedRailWallProps(selectedRailInfo.heightLevel, val);
                    onChange();
                }).element,
            );
    });
    const voxelWalls = controller.listPlacedVoxelWalls();
    const railWalls = controller.listPlacedRailWalls();
    appendSection(container, "wall-scene", "Scene", sectionOpen("wall-scene"), (body) => {
        appendEditorSubhead(body, "Voxel blocks");
        appendInstanceList(
            body,
            voxelWalls.map((entry) => ({
                label: entry.label,
                selected: selectedVoxel?.col === entry.col && selectedVoxel.row === entry.row,
                onSelect: () => controller.setSelectedVoxelCell(entry.col, entry.row),
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
                onSelect: () => controller.setSelectedRailEdge(entry.col, entry.row, entry.side),
                onDelete: () => {
                    controller.setSelectedRailEdge(entry.col, entry.row, entry.side);
                    controller.deleteSelectedWall();
                    onChange();
                },
            })),
            "No rail walls placed yet.",
        );
    });
    appendSection(container, "wall-selected", "Selected", sectionOpen("wall-selected", true), (body) => {
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
            return;
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
            return;
        }
        appendEditorHint(body, "Select a voxel block or rail wall from Scene, or click the map to place one.");
    });
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
        appendPanelTabs(container, controller, onChange);
        if (controller.getEditorPanelTab() === "walls") {
            renderWallsPanel(container, controller, onChange, (id, fallback = true) => {
                if (openSections.size > 0) return openSections.has(id);
                return isFirstRender ? fallback : openSections.has(id);
            });
            isFirstRender = false;
            return;
        }
        const spawnOptions = buildSpawnOptions(propIds);
        if (spawnOptions.length === 0) {
            appendEditorHint(container, "No sandbox spawn options loaded");
            return;
        }
        const sectionOpen = (id, fallback = true) => {
            if (openSections.size > 0) return openSections.has(id);
            return isFirstRender ? fallback : openSections.has(id);
        };
        const selectedId = controller.getSelectedPropId();
        const selectedPropIds = new Set(controller.getSelectedPropIds());
        const selectedProp = controller.getSelectedProp();
        const selectedFloorCell = controller.getSelectedFloorCell();
        const selectedFloorBelt = controller.getSelectedFloorBeltInfo();
        const selectionCount = selectedPropIds.size;
        const hasFloorSelection = selectedFloorCell != null;
        const toolsRow = document.createElement("div");
        toolsRow.className = "sandbox-add-row";
        const ringsField = document.createElement("label");
        ringsField.className = "param-field check-inline";
        const ringsCheckbox = document.createElement("input");
        ringsCheckbox.type = "checkbox";
        ringsCheckbox.checked = controller.getShowSelectionRings();
        ringsCheckbox.addEventListener("change", () => {
            controller.setShowSelectionRings(ringsCheckbox.checked);
            onChange();
        });
        ringsField.append(ringsCheckbox, document.createTextNode(" Selection rings"));
        toolsRow.appendChild(ringsField);
        const deleteSelectedBtn = document.createElement("button");
        deleteSelectedBtn.type = "button";
        deleteSelectedBtn.className = "secondary";
        deleteSelectedBtn.disabled = selectionCount === 0 && !hasFloorSelection;
        deleteSelectedBtn.textContent = selectionCount > 1 ? `Delete selected (${selectionCount})` : hasFloorSelection && selectionCount === 0 ? "Delete belt" : "Delete selected";
        deleteSelectedBtn.addEventListener("click", () => {
            if (hasFloorSelection && selectionCount === 0) controller.deleteSelectedFloorCell();
            else controller.deleteSelectedProps();
            onChange();
        });
        toolsRow.appendChild(deleteSelectedBtn);
        container.appendChild(toolsRow);
        appendSection(container, "spawn", "Spawn", sectionOpen("spawn"), (body) => {
            const addRow = document.createElement("div");
            addRow.className = "sandbox-add-row";
            let spawnId = controller.getSpawnPropId();
            if (!spawnOptions.some((option) => option.value === spawnId)) {
                spawnId = spawnOptions[0].value;
                controller.setSpawnPropId(spawnId);
            }
            appendSelectField(addRow, "Prop", {
                value: spawnId,
                options: spawnOptions,
                onChange: (value) => {
                    controller.setSpawnPropId(value);
                    onChange();
                },
            });
            const spawnAsset = getPropAsset(spawnId);
            if (spawnAsset && !isGridFloorBeltSpawnAsset(spawnAsset))
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
        });
        const placed = controller.listPlacedProps();
        const floorBelts = controller.listPlacedFloorBelts();
        appendSection(container, "scene", "Scene", sectionOpen("scene"), (body) => {
            appendEditorSubhead(body, "Props");
            appendInstanceList(
                body,
                placed.map((entry) => ({
                    label: `${entry.label} · ${formatSandboxFactionLabel(entry.faction)}`,
                    selected: selectedPropIds.has(entry.id),
                    onSelect: () => controller.setSelectedPropId(entry.id),
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
        });
        appendSection(container, "scene-json", "Scene JSON", sectionOpen("scene-json"), (body) => {
            appendEditorHint(body, "Copy/paste sandbox layout: props (world x/y), voxel walls, rail walls, floor belts. Replace clears the current sandbox first.");
            const textarea = document.createElement("textarea");
            textarea.className = "editor-export-area";
            textarea.rows = 10;
            textarea.spellcheck = false;
            body.appendChild(textarea);
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
            body.appendChild(row);
        });
        appendSection(container, "selected", "Selected", sectionOpen("selected", true), (body) => {
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
                appendEditorHint(body, "Select a prop or conveyor belt from Scene.");
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
