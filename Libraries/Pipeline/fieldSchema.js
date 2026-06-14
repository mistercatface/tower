/**
 * @typedef {{
 *   path: string,
 *   label: string,
 *   kind?: "number" | "integer" | "boolean" | "select" | "custom",
 *   min?: number,
 *   max?: number,
 *   step?: number,
 *   options?: (string | { value?: string, id?: string, label?: string, name?: string })[],
 *   required?: boolean,
 *   custom?: string,
 * }} FieldDef
 */

/** @param {FieldDef} field */
export function resolveFieldKind(field) {
    if (field.kind) return field.kind;
    if (field.options?.length) return "select";
    return "number";
}

/** @param {FieldDef["options"] | undefined} options */
function selectOptionValues(options) {
    if (!options) return [];
    /** @type {string[]} */
    const values = [];
    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        if (typeof opt === "string") values.push(opt);
        else values.push(String(opt.value ?? opt.id ?? ""));
    }
    return values;
}

/** @param {unknown} value @param {FieldDef} field @returns {string | null} error message or null when valid */
export function validateFieldValue(value, field) {
    const kind = resolveFieldKind(field);
    if (value === undefined || value === null) return field.required ? `${field.label} is required` : null;
    if (kind === "boolean") return typeof value === "boolean" ? null : `${field.label} must be true or false`;
    if (kind === "select") {
        const allowed = selectOptionValues(field.options);
        if (allowed.length === 0) return null;
        return allowed.includes(String(value)) ? null : `${field.label} must be one of: ${allowed.join(", ")}`;
    }
    if (kind === "custom") return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return `${field.label} must be a number`;
    if (kind === "integer" && !Number.isInteger(num)) return `${field.label} must be an integer`;
    if (field.min != null && num < field.min) return `${field.label} must be >= ${field.min}`;
    if (field.max != null && num > field.max) return `${field.label} must be <= ${field.max}`;
    return null;
}

/** @param {unknown} value @param {FieldDef} field */
export function clampFieldValue(value, field) {
    const kind = resolveFieldKind(field);
    if (kind === "select") {
        const allowed = selectOptionValues(field.options);
        if (allowed.length === 0) return value;
        return allowed.includes(String(value)) ? value : allowed[0];
    }
    if (kind === "boolean") return Boolean(value);
    if (kind === "custom") return value;
    let num = Number(value);
    if (!Number.isFinite(num)) num = field.min ?? 0;
    if (kind === "integer") num = Math.round(num);
    if (field.min != null) num = Math.max(field.min, num);
    if (field.max != null) num = Math.min(field.max, num);
    if (kind === "integer") num = Math.round(num);
    return num;
}
