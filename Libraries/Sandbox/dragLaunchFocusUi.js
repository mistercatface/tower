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
    if (ids.length === 0) {
        container.innerHTML = `<span class="hint-inline">No launchable props loaded</span>`;
        return () => {};
    }
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
    container.innerHTML = "";
    const label = document.createElement("label");
    label.className = "toy-focus-label";
    label.textContent = "Toy: ";
    label.appendChild(select);
    container.appendChild(label);
    return () => {
        select.removeEventListener("change", handleChange);
        container.innerHTML = "";
    };
}
