import { listDragLaunchPropIds } from "./dragLaunchCatalog.js";
/**
 * @param {HTMLElement} container
 * @param {ReturnType<import("./createDragLaunchToy.js").createDragLaunchToy>} toy
 * @param {() => void} onChange
 */
export function mountSandboxToyUi(container, toy, onChange) {
    const ids = listDragLaunchPropIds();
    const render = () => {
        container.innerHTML = "";
        if (ids.length === 0) {
            container.innerHTML = `<p class="editor-hint">No launchable props loaded</p>`;
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
        typeSelect.value = toy.getSpawnPropId();
        typeSelect.addEventListener("change", () => {
            toy.setSpawnPropId(typeSelect.value);
            onChange();
        });
        typeField.append(typeLabel, typeSelect);
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "secondary";
        addBtn.textContent = "Add at camera";
        addBtn.addEventListener("click", () => {
            toy.spawnAtCameraOrigin();
        });
        addRow.append(typeField, addBtn);
        container.appendChild(addRow);
        const listHead = document.createElement("div");
        listHead.className = "editor-subhead";
        listHead.textContent = "Placed toys";
        container.appendChild(listHead);
        const list = document.createElement("div");
        list.className = "toy-instance-list";
        const placed = toy.listPlacedPickups();
        const selectedId = toy.getSelectedPickupId();
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
                    toy.setSelectedPickupId(entry.id);
                });
                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "toy-delete-btn secondary";
                deleteBtn.textContent = "Delete";
                deleteBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    toy.deletePickupById(entry.id);
                });
                row.append(selectBtn, deleteBtn);
                list.appendChild(row);
            }
        container.appendChild(list);
    };
    toy.setUiSync(render);
    render();
    return () => {
        toy.setUiSync(null);
        container.innerHTML = "";
    };
}
