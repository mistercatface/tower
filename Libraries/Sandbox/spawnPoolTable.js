import { spawnAssembly, deleteAssemblyInstance, clearAssemblyInstances } from "./spawnAssembly.js";
/** @param {import("./SandboxHostPort.js").SandboxHostPort} host @param {number} centerX @param {number} centerY @param {{ faction?: string }} [options] */
export function spawnPoolTable(host, centerX, centerY, options = {}) {
    return spawnAssembly(host, centerX, centerY, "poolTable", options);
}
/** @param {object} state @param {string} tableId */
export function deletePoolTable(state, tableId) {
    deleteAssemblyInstance(state, tableId);
}
/** @param {object} state */
export function clearPoolTables(state) {
    clearAssemblyInstances(state);
}
