export function createSandboxSelection({ isLiveProp }) {
    /** @type {SandboxSelection | null} */
    let selection = null;
    /** @param {SandboxSelection | null} next */
    const assign = (next) => {
        selection = next;
    };
    /** @param {SandboxSelectInput | null} input */
    const select = (input) => {
        if (input == null) {
            assign(null);
            return;
        }
        if (input.kind === "prop") {
            const ids = new Set();
            for (let i = 0; i < input.ids.length; i++) {
                const id = input.ids[i];
                if (isLiveProp(id)) ids.add(id);
            }
            assign(ids.size === 0 ? null : { kind: "prop", ids });
            return;
        }
        if (input.kind === "floor") {
            assign({ kind: "floor", col: input.col, row: input.row });
            return;
        }
        if (input.kind === "voxel") {
            assign({ kind: "voxel", col: input.col, row: input.row });
            return;
        }
        if (input.kind === "rail") {
            assign({ kind: "rail", col: input.col, row: input.row, side: input.side });
            return;
        }
    };
    const clearSelection = () => {
        assign(null);
    };
    const clearPropSelection = () => {
        if (selection?.kind === "prop") assign(null);
    };
    const clearFloorSelection = () => {
        if (selection?.kind === "floor") assign(null);
    };
    const clearWallSelection = () => {
        if (selection?.kind === "voxel" || selection?.kind === "rail") assign(null);
    };
    const prunePropSelection = () => {
        if (selection?.kind !== "prop") return false;
        let changed = false;
        for (const id of selection.ids)
            if (!isLiveProp(id)) {
                selection.ids.delete(id);
                changed = true;
            }
        if (!changed) return false;
        if (selection.ids.size === 0) assign(null);
        return true;
    };
    const removePropFromSelection = (propId) => {
        if (selection?.kind !== "prop" || !selection.ids.delete(propId)) return false;
        if (selection.ids.size === 0) assign(null);
        return true;
    };
    const togglePropInSelection = (propId) => {
        if (!isLiveProp(propId)) return false;
        if (selection?.kind === "prop") {
            if (selection.ids.has(propId)) selection.ids.delete(propId);
            else selection.ids.add(propId);
            if (selection.ids.size === 0) assign(null);
            return true;
        }
        assign({ kind: "prop", ids: new Set([propId]) });
        return true;
    };
    const dropDeletedWallSelection = (col, row, side = null) => {
        if (selection?.kind === "voxel" && selection.col === col && selection.row === row) {
            assign(null);
            return;
        }
        if (selection?.kind === "rail" && selection.col === col && selection.row === row && (side == null || selection.side === side)) assign(null);
    };
    return {
        getSelection: () => selection,
        select,
        clearSelection,
        clearPropSelection,
        clearFloorSelection,
        clearWallSelection,
        prunePropSelection,
        removePropFromSelection,
        togglePropInSelection,
        dropDeletedWallSelection,
    };
}
/** @typedef {{ kind: 'prop', ids: Set<number> } | { kind: 'floor', col: number, row: number } | { kind: 'voxel', col: number, row: number } | { kind: 'rail', col: number, row: number, side: number }} SandboxSelection */
/** @typedef {{ kind: 'prop', ids: number[] } | { kind: 'floor', col: number, row: number } | { kind: 'voxel', col: number, row: number } | { kind: 'rail', col: number, row: number, side: number }} SandboxSelectInput */
