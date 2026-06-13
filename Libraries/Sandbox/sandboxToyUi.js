import { getPropAsset, getWorldPropDefinitions, formatSandboxSpawnLabel } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, SANDBOX_FACTION_OPTIONS, formatSandboxFactionLabel, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { getSandboxBehaviorLabel, isSandboxEquippable, isSandboxSpawnable, listFloorBeltKindOptions } from "./sandboxCapabilities.js";
import { isSpawnerProp, listSpawnerSpawnPropIds, resolveSpawnerPropId } from "./spawnerConfig.js";
import { appendSandboxWorldPropInspectorFields, appendButtonWireInspector } from "./sandboxWorldPropInspector.js";
import { isButtonEntity } from "./buttonInput.js";
import { renderSandboxEquipPanel } from "./sandboxEquipPanel.js";
import { SANDBOX_PATH_VISUAL_LABELS, SANDBOX_PATH_VISUAL_OPTIONS } from "./sandboxPathVisual.js";
import { SANDBOX_PROP_VISUAL_LABELS, SANDBOX_PROP_VISUAL_OPTIONS } from "./sandboxPropVisual.js";
import { sandboxSpawnAssemblyId, isSandboxSpawnPropId } from "./sandboxSession.js";
import { appendAxisNumberFields, appendEditorHint, appendEditorSubhead, appendInstanceList, appendSelectField } from "../UI/paramFields.js";
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
/**
 * @param {string[]} propIds
 * @param {{ id: string, label: string }[]} assemblyManifests
 */
function buildSpawnOptions(propIds, assemblyManifests) {
    /** @type {{ value: string, label: string }[]} */
    const options = propIds.map((id) => ({ value: id, label: formatSandboxSpawnLabel(id) }));
    const assemblies = [...assemblyManifests].sort((a, b) => a.label.localeCompare(b.label));
    for (const manifest of assemblies) options.push({ value: sandboxSpawnAssemblyId(manifest.id), label: manifest.label });
    return options;
}
/**
 * @param {HTMLElement} container
 * @param {ReturnType<import("./createSandboxController.js").createSandboxController>} controller
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
        const assemblyManifests = controller.listAssemblyManifests();
        const spawnOptions = buildSpawnOptions(propIds, assemblyManifests);
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
            if (isSandboxSpawnPropId(spawnId))
                appendFactionSelect(addRow, {
                    value: controller.getSpawnFaction(),
                    onChange: (faction) => {
                        controller.setSpawnFaction(faction);
                        onChange();
                    },
                });
            const spawnBehaviorIds = controller.listSpawnBehaviors();
            if (isSandboxSpawnPropId(spawnId) && spawnBehaviorIds.length > 0)
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
        const assemblies = controller.listAssemblies();
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
            if (assemblies.length > 0) {
                appendEditorSubhead(body, "Assemblies");
                appendInstanceList(
                    body,
                    assemblies.map((entry) => ({
                        label: entry.label,
                        selected: entry.defaultPropId === selectedId,
                        onSelect: () => {
                            if (entry.defaultPropId != null) controller.setSelectedPropId(entry.defaultPropId);
                        },
                        onDelete: () => controller.deleteAssemblyById(entry.id),
                    })),
                    "",
                );
            }
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
