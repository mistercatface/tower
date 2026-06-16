import { Component, setFormFieldName } from "../Component.js";
export class SelectControl extends Component {
    constructor(label, options, initialValue, onChange) {
        super("label", "param-field");
        const labelSpan = document.createElement("span");
        labelSpan.textContent = label;
        this.element.appendChild(labelSpan);
        this.select = document.createElement("select");
        setFormFieldName(this.select, label);
        for (const opt of options) {
            const o = document.createElement("option");
            if (typeof opt === "string") {
                o.value = opt;
                o.textContent = opt;
            } else {
                o.value = opt.id ?? opt.value;
                o.textContent = opt.label ?? opt.name;
            }
            if (o.value === String(initialValue)) o.selected = true;
            this.select.appendChild(o);
        }
        this.element.appendChild(this.select);
        this.select.addEventListener("change", () => {
            onChange(this.select.value);
        });
    }
    setValue(val) {
        this.select.value = String(val);
    }
}
