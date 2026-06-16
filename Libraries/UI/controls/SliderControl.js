import { Component, setFormFieldName } from "../Component.js";
export class SliderControl extends Component {
    constructor(label, min, max, step, initialValue, onChange, formatValue = (v) => String(v)) {
        super("label", "param-field");
        const labelSpan = document.createElement("span");
        labelSpan.textContent = label;
        this.element.appendChild(labelSpan);
        this.input = document.createElement("input");
        this.input.type = "range";
        setFormFieldName(this.input, label);
        this.input.min = String(min);
        this.input.max = String(max);
        this.input.step = String(step);
        this.input.value = String(initialValue);
        this.output = document.createElement("span");
        this.output.className = "param-value";
        this.output.textContent = formatValue(initialValue);
        this.formatValue = formatValue;
        this.element.appendChild(this.input);
        this.element.appendChild(this.output);
        this.input.addEventListener("input", () => {
            const val = Number(this.input.value);
            this.output.textContent = this.formatValue(val);
            onChange(val);
        });
    }
    setValue(val) {
        this.input.value = String(val);
        this.output.textContent = this.formatValue(val);
    }
}
