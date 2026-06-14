/** @typedef {{ editorId?: string, id?: string, enabled?: boolean, config: Record<string, unknown> } & Record<string, unknown>} PipelineEditorRow */
/** @param {PipelineEditorRow} row */
export function pipelineRowId(row) {
    return row.editorId ?? row.id ?? "";
}
/** @param {Record<string, unknown>} config @param {string} editorId @param {{ enabled?: boolean }} [options] */
export function createPipelineRow(config, editorId, options = {}) {
    return { editorId, id: editorId, enabled: options.enabled !== false, config };
}
/** @param {PipelineEditorRow[]} rows @param {string} editorId */
export function findPipelineRowIndex(rows, editorId) {
    for (let i = 0; i < rows.length; i++) if (pipelineRowId(rows[i]) === editorId) return i;
    return -1;
}
/** @param {PipelineEditorRow[]} rows @param {number} index @param {number} direction — -1 up, +1 down @returns {boolean} */
export function movePipelineRow(rows, index, direction) {
    const target = index + direction;
    if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return false;
    const row = rows[index];
    rows[index] = rows[target];
    rows[target] = row;
    return true;
}
/** @param {PipelineEditorRow[]} rows @param {number} index @returns {PipelineEditorRow | undefined} */
export function removePipelineRowAt(rows, index) {
    if (index < 0 || index >= rows.length) return undefined;
    return rows.splice(index, 1)[0];
}
/** @param {number} fromIndex @param {number} toIndex */
export function remapIndexAfterSwap(fromIndex, toIndex) {
    /** @param {number} index */
    return (index) => {
        if (index === fromIndex) return toIndex;
        if (index === toIndex) return fromIndex;
        return index;
    };
}
/** @param {number} removedIndex */
export function remapIndexAfterRemove(removedIndex) {
    /** @param {number} index */
    return (index) => {
        if (index === removedIndex) return -1;
        if (index > removedIndex) return index - 1;
        return index;
    };
}
/** @param {number[]} indices @param {(index: number) => number} remap @returns {number[]} deduped, drops negatives */
export function remapIndexList(indices, remap) {
    /** @type {number[]} */
    const out = [];
    /** @type {Set<number>} */
    const seen = new Set();
    for (let i = 0; i < indices.length; i++) {
        const next = remap(indices[i]);
        if (next < 0 || seen.has(next)) continue;
        seen.add(next);
        out.push(next);
    }
    return out;
}
