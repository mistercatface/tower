import { getPropAsset, getWorldPropDefinitions } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, SANDBOX_FACTION_OPTIONS, formatSandboxFactionLabel, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { getSandboxBehaviorLabel, isSandboxEquippable, isSandboxSpawnable } from "./sandboxCapabilities.js";
import { renderSandboxEquipPanel } from "./sandboxEquipPanel.js";
import { SANDBOX_PATH_VISUAL_LABELS, SANDBOX_PATH_VISUAL_OPTIONS } from "./sandboxPathVisual.js";
function appendFactionSelect(parent, { value, onChange }) {
    const field = document.createElement("div");
    field.className = "param-field";
    const label = document.createElement("span");
    label.textContent = "Team";
    const select = document.createElement("select");
    for (const option of SANDBOX_FACTION_OPTIONS) {
        const el = document.createElement("option");
        el.value = option.id;
        el.textContent = option.label;
        select.appendChild(el);
    }
    select.value = value ?? SANDBOX_DEFAULT_FACTION;
    select.addEventListener("change", () => onChange(select.value));
    field.append(label, select);
    parent.appendChild(field);
    return select;
}
/**
 * @param {HTMLElement} container
 * @param {ReturnType<import("./createSandboxController.js").createSandboxController>} controller
 * @param {() => void} onChange
 */
export function mountSandboxToyUi(container, controller, onChange) {
    const ids = Object.keys(getWorldPropDefinitions())
        .filter((id) => isSandboxSpawnable(getPropAsset(id)))
        .sort();
    const render = () => {
        container.innerHTML = "";
        if (ids.length === 0) {
            container.innerHTML = `<p class="editor-hint">No sandbox props loaded</p>`;
            return;
        }
        const addRow = document.createElement("div");
        addRow.className = "sandbox-add-row";
        const typeField = document.createElement("div");
        typeField.className = "param-field";
        const typeLabel = document.createElement("span");
        typeLabel.textContent = "Type";
        const typeSelect = document.createElement("select");
        for (const id of ids) {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = id.replace(/_/g, " ");
            typeSelect.appendChild(option);
        }
        typeSelect.value = controller.getSpawnPropId();
        typeSelect.addEventListener("change", () => {
            controller.setSpawnPropId(typeSelect.value);
            onChange();
        });
        typeField.append(typeLabel, typeSelect);
        appendFactionSelect(addRow, {
            value: controller.getSpawnFaction(),
            onChange: (faction) => {
                controller.setSpawnFaction(faction);
                onChange();
            },
        });
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "secondary";
        addBtn.textContent = "Add at camera";
        addBtn.addEventListener("click", () => {
            controller.spawnAtCameraOrigin();
        });
        const addVoidBtn = document.createElement("button");
        addVoidBtn.type = "button";
        addVoidBtn.className = "secondary";
        addVoidBtn.textContent = "Add void";
        addVoidBtn.addEventListener("click", () => {
            controller.spawnVoidAtCameraOrigin();
        });
        addRow.append(typeField, addBtn, addVoidBtn);
        container.appendChild(addRow);
        const behaviorIds = controller.listBehaviors();
        if (behaviorIds.length > 0) {
            const modeField = document.createElement("div");
            modeField.className = "param-field";
            modeField.style.marginTop = "8px";
            modeField.style.marginBottom = "8px";
            const modeLabel = document.createElement("span");
            modeLabel.textContent = "Mode";
            const modeSelect = document.createElement("select");
            for (const behaviorId of behaviorIds) {
                const option = document.createElement("option");
                option.value = behaviorId;
                option.textContent = getSandboxBehaviorLabel(behaviorId);
                modeSelect.appendChild(option);
            }
            modeSelect.value = controller.getActiveBehaviorId();
            modeSelect.addEventListener("change", () => {
                controller.setActiveBehaviorId(modeSelect.value);
                onChange();
            });
            modeField.append(modeLabel, modeSelect);
            container.appendChild(modeField);
        }
        const listHead = document.createElement("div");
        listHead.className = "editor-subhead";
        listHead.textContent = "Placed toys";
        container.appendChild(listHead);
        const list = document.createElement("div");
        list.className = "toy-instance-list";
        const placed = controller.listPlacedPickups();
        const selectedId = controller.getSelectedPickupId();
        if (placed.length === 0) {
            const empty = document.createElement("p");
            empty.className = "editor-hint";
            empty.textContent = "No toys placed yet.";
            list.appendChild(empty);
        } else
            for (const entry of placed) {
                const row = document.createElement("div");
                row.className = `toy-instance-row${entry.id === selectedId ? " selected" : ""}`;
                const selectBtn = document.createElement("button");
                selectBtn.type = "button";
                selectBtn.className = "toy-select-btn";
                selectBtn.textContent = `${entry.label} · ${formatSandboxFactionLabel(entry.faction)}`;
                selectBtn.addEventListener("click", () => {
                    controller.setSelectedPickupId(entry.id);
                });
                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "toy-delete-btn secondary";
                deleteBtn.textContent = "Delete";
                deleteBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    controller.deletePickupById(entry.id);
                });
                row.append(selectBtn, deleteBtn);
                list.appendChild(row);
            }
        container.appendChild(list);
        const voidZones = controller.listVoidZones?.() ?? [];
        if (voidZones.length > 0) {
            const voidHead = document.createElement("div");
            voidHead.className = "editor-subhead";
            voidHead.textContent = "Void zones";
            container.appendChild(voidHead);
            const voidList = document.createElement("div");
            voidList.className = "toy-instance-list";
            for (const entry of voidZones) {
                const row = document.createElement("div");
                row.className = "toy-instance-row";
                const label = document.createElement("span");
                label.className = "toy-select-btn";
                label.textContent = `${entry.label} · r${entry.radius}`;
                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "toy-delete-btn secondary";
                deleteBtn.textContent = "Delete";
                deleteBtn.addEventListener("click", () => controller.deleteVoidZoneById(entry.id));
                row.append(label, deleteBtn);
                voidList.appendChild(row);
            }
            container.appendChild(voidList);
        }
        const selectedPickup = controller.getSelectedPickup?.() ?? null;
        if (selectedPickup) {
            const selectedPanel = document.createElement("div");
            selectedPanel.className = "sandbox-selected-panel";
            const selectedHead = document.createElement("div");
            selectedHead.className = "editor-subhead";
            selectedHead.textContent = "Selected toy";
            selectedPanel.appendChild(selectedHead);
            appendFactionSelect(selectedPanel, {
                value: resolveSandboxFaction(selectedPickup),
                onChange: (faction) => {
                    selectedPickup.faction = faction;
                    controller.sync?.();
                    onChange();
                },
            });
            const pathField = document.createElement("div");
            pathField.className = "param-field";
            const pathLabel = document.createElement("span");
            pathLabel.textContent = "Path visual";
            const pathSelect = document.createElement("select");
            for (const optionId of SANDBOX_PATH_VISUAL_OPTIONS) {
                const option = document.createElement("option");
                option.value = optionId;
                option.textContent = SANDBOX_PATH_VISUAL_LABELS[optionId];
                pathSelect.appendChild(option);
            }
            pathSelect.value = controller.getPathVisual(selectedPickup);
            pathSelect.addEventListener("change", () => {
                controller.setPathVisual(pathSelect.value, selectedPickup);
                onChange();
            });
            pathField.append(pathLabel, pathSelect);
            selectedPanel.appendChild(pathField);
            container.appendChild(selectedPanel);
        }
        const equipPanel = document.createElement("div");
        equipPanel.className = "sandbox-equip-panel";
        if (selectedPickup && isSandboxEquippable(getPropAsset(selectedPickup.type)))
            renderSandboxEquipPanel(equipPanel, selectedPickup, () => {
                controller.sync?.();
                onChange();
            });
        if (equipPanel.childElementCount > 0) container.appendChild(equipPanel);
    };
    controller.setUiSync(render);
    render();
    return () => {
        controller.setUiSync(null);
        container.innerHTML = "";
    };
}
