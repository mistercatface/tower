import { getPropAsset, getWorldPropDefinitions } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, SANDBOX_FACTION_OPTIONS, formatSandboxFactionLabel, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { getSandboxBehaviorLabel, isSandboxEquippable, isSandboxSpawnable } from "./sandboxCapabilities.js";
import { isSpawnerProp, listSpawnerSpawnPropIds, resolveSpawnerPropId } from "./spawnerConfig.js";
import { appendSandboxWorldPropInspectorFields, appendTranslateFields } from "./sandboxWorldPropInspector.js";
import { PAD_PRESETS } from "./padPresets.js";
import { renderSandboxEquipPanel } from "./sandboxEquipPanel.js";
import { SANDBOX_PATH_VISUAL_LABELS, SANDBOX_PATH_VISUAL_OPTIONS } from "./sandboxPathVisual.js";
import { SANDBOX_PROP_VISUAL_LABELS, SANDBOX_PROP_VISUAL_OPTIONS } from "./sandboxPropVisual.js";
import { sandboxSpawnAssemblyId, sandboxSpawnPadId, isSandboxSpawnPadId, isSandboxSpawnPropId, parseSandboxPadPreset } from "./sandboxSession.js";
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
function appendSubhead(parent, text) {
    const head = document.createElement("div");
    head.className = "editor-subhead";
    head.textContent = text;
    parent.appendChild(head);
}
function appendSelectField(parent, labelText, { value, options, onChange }) {
    const field = document.createElement("div");
    field.className = "param-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const select = document.createElement("select");
    for (const option of options) {
        const el = document.createElement("option");
        el.value = option.value;
        el.textContent = option.label;
        select.appendChild(el);
    }
    select.value = value;
    select.addEventListener("change", () => onChange(select.value));
    field.append(label, select);
    parent.appendChild(field);
    return select;
}
/** @param {HTMLElement} parent @param {string} labelText @param {{ value: number, step?: number, min?: number, onChange: (value: number) => void }} opts */
function appendNumberField(parent, labelText, { value, step = 1, min, onChange }) {
    const field = document.createElement("div");
    field.className = "param-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    if (min != null) input.min = String(min);
    input.value = String(value);
    const valueSpan = document.createElement("span");
    valueSpan.className = "param-value";
    valueSpan.textContent = String(value);
    input.addEventListener("change", () => {
        const next = Number(input.value);
        if (!Number.isFinite(next)) {
            input.value = String(value);
            return;
        }
        onChange(next);
        valueSpan.textContent = String(next);
    });
    field.append(label, input, valueSpan);
    parent.appendChild(field);
}
/**
 * @param {HTMLElement} parent
 * @param {Array<{ label: string, selected?: boolean, onSelect?: () => void, onDelete: () => void }>} entries
 * @param {string} emptyText
 */
function appendEntityList(parent, entries, emptyText) {
    const list = document.createElement("div");
    list.className = "toy-instance-list";
    if (entries.length === 0) {
        const empty = document.createElement("p");
        empty.className = "editor-hint";
        empty.textContent = emptyText;
        list.appendChild(empty);
    } else
        for (const entry of entries) {
            const row = document.createElement("div");
            row.className = `toy-instance-row${entry.selected ? " selected" : ""}`;
            if (entry.onSelect) {
                const selectBtn = document.createElement("button");
                selectBtn.type = "button";
                selectBtn.className = "toy-select-btn";
                selectBtn.textContent = entry.label;
                selectBtn.addEventListener("click", entry.onSelect);
                row.appendChild(selectBtn);
            } else {
                const label = document.createElement("span");
                label.className = "toy-select-btn";
                label.textContent = entry.label;
                row.appendChild(label);
            }
            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "toy-delete-btn secondary";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                entry.onDelete();
            });
            row.appendChild(deleteBtn);
            list.appendChild(row);
        }
    parent.appendChild(list);
}
function appendPullPadFields(parent, { width, height, forceX, forceY, showForce, onChange }) {
    appendNumberField(parent, "Width", { value: width, step: 1, min: 1, onChange: (nextWidth) => onChange({ width: nextWidth, height, forceX, forceY }) });
    appendNumberField(parent, "Height", { value: height, step: 1, min: 1, onChange: (nextHeight) => onChange({ width, height: nextHeight, forceX, forceY }) });
    if (showForce) {
        appendNumberField(parent, "Force X", { value: forceX, step: 50, onChange: (nextForceX) => onChange({ width, height, forceX: nextForceX, forceY }) });
        appendNumberField(parent, "Force Y", { value: forceY, step: 50, onChange: (nextForceY) => onChange({ width, height, forceX, forceY: nextForceY }) });
    }
}
function appendFactionSelect(parent, { value, onChange }) {
    appendSelectField(parent, "Team", { value: value ?? SANDBOX_DEFAULT_FACTION, options: SANDBOX_FACTION_OPTIONS.map((option) => ({ value: option.id, label: option.label })), onChange });
}
/** @param {{ id: string, preset: string, label: string, radius?: number, sinkDepth?: number, halfWidth?: number, halfHeight?: number, linkCount?: number }} entry */
function formatPadListLabel(entry) {
    if (entry.preset === "pull" && entry.halfWidth != null && entry.halfHeight != null) return `${entry.label} · ${Math.round(entry.halfWidth * 2)}×${Math.round(entry.halfHeight * 2)}`;
    if (entry.preset === "button" && entry.linkCount) return `${entry.label} · ${entry.linkCount} wire${entry.linkCount === 1 ? "" : "s"}`;
    if (entry.radius != null) return `${entry.label} · r${Math.round(entry.radius * 10) / 10}`;
    return entry.label;
}
/**
 * @param {string[]} propIds
 * @param {{ id: string, label: string }[]} assemblyManifests
 */
function buildSpawnOptions(propIds, assemblyManifests) {
    /** @type {{ value: string, label: string }[]} */
    const options = propIds.map((id) => ({ value: id, label: id.replace(/_/g, " ") }));
    for (const preset of Object.keys(PAD_PRESETS)) options.push({ value: sandboxSpawnPadId(preset), label: PAD_PRESETS[preset].listLabel });
    const assemblies = [...assemblyManifests].sort((a, b) => a.label.localeCompare(b.label));
    for (const manifest of assemblies) options.push({ value: sandboxSpawnAssemblyId(manifest.id), label: manifest.label });
    return options;
}
/**
 * @param {HTMLElement} body
 * @param {ReturnType<import("./createSandboxController.js").createSandboxController>} controller
 * @param {() => void} onChange
 */
function renderSelectedPadInspector(body, controller, onChange) {
    const pad = controller.getSelectedPad();
    if (!pad) return false;
    const presetLabel = document.createElement("p");
    presetLabel.className = "editor-hint";
    presetLabel.textContent = `${pad.label} (${pad.preset})`;
    body.appendChild(presetLabel);
    const patch = (fields) => {
        controller.patchSelectedPad(fields);
        onChange();
    };
    appendTranslateFields(body, {
        x: pad.x,
        y: pad.y,
        onPatch: (pos) => {
            const fields = {};
            if (pos.x != null) fields.x = pos.x;
            if (pos.y != null) fields.y = pos.y;
            patch(fields);
        },
    });
    if (pad.preset === "sink") {
        appendNumberField(body, "Radius", { value: pad.radius, step: 0.5, min: 0.5, onChange: (radius) => patch({ radius }) });
        appendNumberField(body, "Depth", { value: pad.sinkDepth, step: 1, min: 1, onChange: (sinkDepth) => patch({ sinkDepth }) });
    } else if (pad.preset === "pull") {
        appendPullPadFields(body, {
            width: pad.halfWidth * 2,
            height: pad.halfHeight * 2,
            forceX: pad.forceX,
            forceY: pad.forceY,
            showForce: true,
            onChange: ({ width, height, forceX, forceY }) => patch({ halfWidth: width / 2, halfHeight: height / 2, forceX, forceY }),
        });
        const wallRow = document.createElement("label");
        wallRow.className = "param-field";
        const wallCheck = document.createElement("input");
        wallCheck.type = "checkbox";
        wallCheck.checked = pad.wallMode;
        wallCheck.addEventListener("change", () => patch({ wallMode: wallCheck.checked }));
        wallRow.append("Wall mode ", wallCheck);
        body.appendChild(wallRow);
    } else if (pad.preset === "button") {
        appendNumberField(body, "Radius", { value: pad.radius, step: 0.5, min: 0.5, onChange: (radius) => patch({ radius }) });
        appendSelectField(body, "Input", {
            value: pad.inputMode,
            options: [
                { value: "tap", label: "Tap" },
                { value: "hold", label: "Hold" },
                { value: "toggle", label: "Toggle" },
                { value: "massTap", label: "Mass – Tap" },
                { value: "massHold", label: "Mass – Hold" },
                { value: "massToggle", label: "Mass – Toggle" },
            ],
            onChange: (inputMode) => patch({ inputMode }),
        });
        if (pad.inputMode === "massTap" || pad.inputMode === "massHold" || pad.inputMode === "massToggle")
            appendNumberField(body, "Mass threshold", { value: pad.massThreshold, step: 0.01, min: 0, onChange: (massThreshold) => patch({ massThreshold }) });
        const invertRow = document.createElement("label");
        invertRow.className = "param-field";
        const invertCheck = document.createElement("input");
        invertCheck.type = "checkbox";
        invertCheck.checked = pad.invert;
        invertCheck.addEventListener("change", () => patch({ invert: invertCheck.checked }));
        invertRow.append("Invert (NOT) ", invertCheck);
        body.appendChild(invertRow);
        const links = controller.listSelectedPadLinks();
        const linkHint = document.createElement("p");
        linkHint.className = "editor-hint";
        linkHint.textContent = links.length ? `${links.length} wire${links.length === 1 ? "" : "s"} connected` : "No wires — link to flippers, spawners, gravity pads, or pits.";
        body.appendChild(linkHint);
        if (links.length)
            appendEntityList(
                body,
                links.map((entry) => ({ label: entry.label, onDelete: () => controller.removeSelectedPadLink(entry.target) })),
                "",
            );
        const wireRow = document.createElement("div");
        wireRow.className = "sandbox-add-row";
        const wireActive = controller.isPadWireLinkActive();
        const connectBtn = document.createElement("button");
        connectBtn.type = "button";
        connectBtn.className = wireActive ? "primary" : "secondary";
        connectBtn.textContent = wireActive ? "Click targets to wire…" : "Connect wire";
        connectBtn.addEventListener("click", () => {
            if (wireActive) controller.cancelPadWireLink();
            else controller.startPadWireLink();
            onChange();
        });
        wireRow.appendChild(connectBtn);
        if (links.length) {
            const clearBtn = document.createElement("button");
            clearBtn.type = "button";
            clearBtn.className = "secondary";
            clearBtn.textContent = "Clear all";
            clearBtn.addEventListener("click", () => {
                controller.clearSelectedPadLinks();
                onChange();
            });
            wireRow.appendChild(clearBtn);
        }
        body.appendChild(wireRow);
    }
    return true;
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
            container.innerHTML = `<p class="editor-hint">No sandbox spawn options loaded</p>`;
            return;
        }
        const sectionOpen = (id, fallback = true) => {
            if (openSections.size > 0) return openSections.has(id);
            return isFirstRender ? fallback : openSections.has(id);
        };
        const selectedId = controller.getSelectedPropId();
        const selectedPropIds = new Set(controller.getSelectedPropIds());
        const selectedPadId = controller.getSelectedPadId();
        const selectedProp = controller.getSelectedProp();
        const selectionCount = selectedPropIds.size;
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
        deleteSelectedBtn.disabled = selectionCount === 0;
        deleteSelectedBtn.textContent = selectionCount > 1 ? `Delete selected (${selectionCount})` : "Delete selected";
        deleteSelectedBtn.addEventListener("click", () => {
            controller.deleteSelectedProps();
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
            if (isSandboxSpawnPadId(spawnId) && parseSandboxPadPreset(spawnId) === "pull") {
                const pullSize = controller.getSpawnPullSize();
                appendPullPadFields(addRow, {
                    width: pullSize.width,
                    height: pullSize.height,
                    forceX: PAD_PRESETS.pull.triggers[0].forceX,
                    forceY: PAD_PRESETS.pull.triggers[0].forceY,
                    showForce: false,
                    onChange: ({ width, height }) => {
                        controller.setSpawnPullSize(width, height);
                    },
                });
            }
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
        const sandboxPads = controller.listSandboxPads();
        const assemblies = controller.listAssemblies();
        appendSection(container, "scene", "Scene", sectionOpen("scene"), (body) => {
            appendSubhead(body, "Props");
            appendEntityList(
                body,
                placed.map((entry) => ({
                    label: `${entry.label} · ${formatSandboxFactionLabel(entry.faction)}`,
                    selected: selectedPropIds.has(entry.id),
                    onSelect: () => controller.setSelectedPropId(entry.id),
                    onDelete: () => controller.deletePropById(entry.id),
                })),
                "No props placed yet.",
            );
            appendSubhead(body, "Pads");
            appendEntityList(
                body,
                sandboxPads.map((entry) => ({
                    label: formatPadListLabel(entry),
                    selected: entry.id === selectedPadId,
                    onSelect: () => controller.setSelectedPadId(entry.id),
                    onDelete: () => controller.deleteSandboxPadById(entry.id),
                })),
                "No pads placed yet.",
            );
            if (assemblies.length > 0) {
                appendSubhead(body, "Assemblies");
                appendEntityList(
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
            if (renderSelectedPadInspector(body, controller, onChange)) return;
            if (selectionCount > 1) {
                const multiHint = document.createElement("p");
                multiHint.className = "editor-hint";
                multiHint.textContent = `${selectionCount} props selected. Drag on empty space to box-select, or click one prop to select only that.`;
                body.appendChild(multiHint);
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
                const empty = document.createElement("p");
                empty.className = "editor-hint";
                empty.textContent = "Select a prop or pad from Scene.";
                body.appendChild(empty);
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
            appendSandboxWorldPropInspectorFields(body, selectedProp, { sync: () => controller.sync?.(), onChange });
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
                        options: spawnPropIds.map((id) => ({ value: id, label: id.replace(/_/g, " ") })),
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
