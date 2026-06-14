/** @param {unknown} value @param {number} [indent] */
export function exportPipelineJson(value, indent = 4) {
    return JSON.stringify(value, null, indent);
}
/** @param {unknown} value @param {string} [varName] */
export function exportPipelineJsModule(value, varName = "default") {
    if (varName === "default") return `export default ${exportPipelineJson(value)};`;
    return `export const ${varName} = ${exportPipelineJson(value)};\nexport default ${varName};`;
}
