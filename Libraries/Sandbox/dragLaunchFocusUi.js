import { listDragLaunchPropIds } from "./dragLaunchCatalog.js";
/**
 * @param {HTMLElement} container
 * @param {{
 *   getFocus: () => string,
 *   setFocus: (id: string) => void,
 *   onChange: () => void,
 * }} toy
 */
export function mountDragLaunchFocusUi(container, toy) {
    const ids = listDragLaunchPropIds();
    container.innerHTML = "";
    if (ids.length === 0) {
        container.innerHTML = `<p class="editor-hint">No launchable props loaded</p>`;
        return () => {
            container.innerHTML = "";
        };
    }
    const field = document.createElement("div");
    field.className = "param-field";
    const label = document.createElement("span");
    label.textContent = "Launch";
    const select = document.createElement("select");
    select.className = "toy-focus-select";
    for (const id of ids) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = id.replace(/_/g, " ");
        select.appendChild(option);
    }
    select.value = toy.getFocus();
    const handleChange = () => {
        toy.setFocus(select.value);
        toy.onChange();
    };
    select.addEventListener("change", handleChange);
    field.append(label, select);
    container.appendChild(field);
    return () => {
        select.removeEventListener("change", handleChange);
        container.innerHTML = "";
    };
}
