import { getPropAsset, getWorldPropDefinitions } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, SANDBOX_FACTION_OPTIONS, formatSandboxFactionLabel, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { getSandboxBehaviorLabel, isSandboxEquippable, isSandboxSpawnable } from "./sandboxCapabilities.js";
import { renderSandboxEquipPanel } from "./sandboxEquipPanel.js";
import { SANDBOX_PATH_VISUAL_LABELS, SANDBOX_PATH_VISUAL_OPTIONS } from "./sandboxPathVisual.js";
import { sandboxSpawnAssemblyId, sandboxSpawnPadId } from "./sandboxSession.js";
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
function appendFactionSelect(parent, { value, onChange }) {
    appendSelectField(parent, "Team", { value: value ?? SANDBOX_DEFAULT_FACTION, options: SANDBOX_FACTION_OPTIONS.map((option) => ({ value: option.id, label: option.label })), onChange });
}
/**
 * @param {string[]} propIds
 * @param {{ id: string, label: string }[]} assemblyManifests
 */
function buildSpawnOptions(propIds, assemblyManifests) {
    /** @type {{ value: string, label: string }[]} */
    const options = propIds.map((id) => ({ value: id, label: id.replace(/_/g, " ") }));
    const assemblies = [...assemblyManifests].sort((a, b) => a.label.localeCompare(b.label));
    for (const manifest of assemblies) {
        if (manifest.label.toLowerCase().includes("pinball")) options.push({ value: sandboxSpawnPadId("sink"), label: "Void pit" });
        options.push({ value: sandboxSpawnAssemblyId(manifest.id), label: manifest.label });
    }
    if (!options.some((option) => option.value === sandboxSpawnPadId("sink"))) options.push({ value: sandboxSpawnPadId("sink"), label: "Void pit" });
    options.push({ value: sandboxSpawnPadId("gate"), label: "Pressure pad" });
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
            container.innerHTML = `<p class="editor-hint">No sandbox spawn options loaded</p>`;
            return;
        }
        const sectionOpen = (id, fallback = true) => {
            if (openSections.size > 0) return openSections.has(id);
            if (id === "selected") return !!controller.getSelectedPickup();
            return isFirstRender ? fallback : openSections.has(id);
        };
        const selectedId = controller.getSelectedPickupId();
        const selectedPickup = controller.getSelectedPickup();
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
            appendFactionSelect(addRow, {
                value: controller.getSpawnFaction(),
                onChange: (faction) => {
                    controller.setSpawnFaction(faction);
                    onChange();
                },
            });
            const spawnBehaviorIds = controller.listSpawnBehaviors();
            if (spawnBehaviorIds.length > 0)
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
        const placed = controller.listPlacedPickups();
        const sandboxPads = controller.listSandboxPads();
        const assemblies = controller.listAssemblies();
        appendSection(container, "scene", "Scene", sectionOpen("scene"), (body) => {
            appendSubhead(body, "Pickups");
            appendEntityList(
                body,
                placed.map((entry) => ({
                    label: `${entry.label} · ${formatSandboxFactionLabel(entry.faction)}`,
                    selected: entry.id === selectedId,
                    onSelect: () => controller.setSelectedPickupId(entry.id),
                    onDelete: () => controller.deletePickupById(entry.id),
                })),
                "No pickups placed yet.",
            );
            if (sandboxPads.length > 0) {
                appendSubhead(body, "Pads");
                appendEntityList(
                    body,
                    sandboxPads.map((entry) => ({ label: entry.radius != null ? `${entry.label} · r${entry.radius}` : entry.label, onDelete: () => controller.deleteSandboxPadById(entry.id) })),
                    "",
                );
            }
            if (assemblies.length > 0) {
                appendSubhead(body, "Assemblies");
                appendEntityList(
                    body,
                    assemblies.map((entry) => ({
                        label: entry.label,
                        selected: entry.defaultPickupId === selectedId,
                        onSelect: () => {
                            if (entry.defaultPickupId != null) controller.setSelectedPickupId(entry.defaultPickupId);
                        },
                        onDelete: () => controller.deleteAssemblyById(entry.id),
                    })),
                    "",
                );
            }
        });
        appendSection(container, "selected", "Selected", sectionOpen("selected", true), (body) => {
            if (!selectedPickup) {
                const empty = document.createElement("p");
                empty.className = "editor-hint";
                empty.textContent = "Select a pickup from Scene.";
                body.appendChild(empty);
                return;
            }
            const behaviorIds = controller.listSelectedBehaviors();
            appendFactionSelect(body, {
                value: resolveSandboxFaction(selectedPickup),
                onChange: (faction) => {
                    selectedPickup.faction = faction;
                    controller.sync?.();
                    onChange();
                },
            });
            if (behaviorIds.length > 0)
                appendSelectField(body, "Mode", {
                    value: controller.getSelectedBehaviorId(),
                    options: behaviorIds.map((behaviorId) => ({ value: behaviorId, label: getSandboxBehaviorLabel(behaviorId) })),
                    onChange: (value) => {
                        controller.setSelectedBehaviorId(value);
                        onChange();
                    },
                });
            const focusField = document.createElement("label");
            focusField.className = "param-field check-inline";
            const focusCheckbox = document.createElement("input");
            focusCheckbox.type = "checkbox";
            focusCheckbox.checked = controller.isCameraTarget(selectedPickup);
            focusCheckbox.addEventListener("change", () => {
                controller.setCameraTarget(focusCheckbox.checked, selectedPickup);
                onChange();
            });
            focusField.append(focusCheckbox, document.createTextNode(" Focus"));
            body.appendChild(focusField);
            appendSelectField(body, "Path visual", {
                value: controller.getPathVisual(selectedPickup),
                options: SANDBOX_PATH_VISUAL_OPTIONS.map((optionId) => ({ value: optionId, label: SANDBOX_PATH_VISUAL_LABELS[optionId] })),
                onChange: (value) => {
                    controller.setPathVisual(value, selectedPickup);
                    onChange();
                },
            });
            if (isSandboxEquippable(getPropAsset(selectedPickup.type))) {
                const equipPanel = document.createElement("div");
                equipPanel.className = "sandbox-equip-panel";
                renderSandboxEquipPanel(equipPanel, selectedPickup, () => {
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
