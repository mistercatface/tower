import { getPropAsset, getWorldPropDefinitions } from "../Props/PropCatalog.js";
import { getSandboxBehaviorLabel, isSandboxEquippable, isSandboxSpawnable } from "./sandboxCapabilities.js";
import { renderSandboxEquipPanel } from "./sandboxEquipPanel.js";
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
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "secondary";
        addBtn.textContent = "Add at camera";
        addBtn.addEventListener("click", () => {
            controller.spawnAtCameraOrigin();
        });
        addRow.append(typeField, addBtn);
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
                selectBtn.textContent = entry.label;
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
        const selectedPickup = controller.getSelectedPickup?.() ?? null;
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
