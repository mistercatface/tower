import { layoutAbsCellIndex, undirectedPairIndex } from "../../Spatial/grid/GridUtils.js";
function undirectedEdgeIndex(aCol, aRow, bCol, bRow, layout) {
    const a = layoutAbsCellIndex(layout, aCol, aRow);
    const b = layoutAbsCellIndex(layout, bCol, bRow);
    return undirectedPairIndex(a, b, layout.cellCount);
}
/** @param {{ col: number, row: number }[]} cells @param {(col: number, row: number) => { col: number, row: number }[]} neighborAt @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout */
export function collectCorridorPathPolylines(cells, neighborAt, layout) {
    const members = cells.slice();
    const memberSet = new Set();
    for (let i = 0; i < members.length; i++) memberSet.add(layoutAbsCellIndex(layout, members[i].col, members[i].row));
    const degreeByIndex = new Map();
    const neighborsByIndex = new Map();
    for (let i = 0; i < members.length; i++) {
        const cell = members[i];
        const idx = layoutAbsCellIndex(layout, cell.col, cell.row);
        const neighbors = neighborAt(cell.col, cell.row).filter((n) => memberSet.has(layoutAbsCellIndex(layout, n.col, n.row)));
        neighborsByIndex.set(idx, neighbors);
        degreeByIndex.set(idx, neighbors.length);
    }
    const isSpecial = (col, row) => degreeByIndex.get(layoutAbsCellIndex(layout, col, row)) !== 2;
    const usedEdges = new Set();
    const paths = [];
    for (let si = 0; si < members.length; si++) {
        const start = members[si];
        if (!isSpecial(start.col, start.row)) continue;
        const startNeighbors = neighborsByIndex.get(layoutAbsCellIndex(layout, start.col, start.row));
        for (let ni = 0; ni < startNeighbors.length; ni++) {
            const first = startNeighbors[ni];
            const edge = undirectedEdgeIndex(start.col, start.row, first.col, first.row, layout);
            if (usedEdges.has(edge)) continue;
            usedEdges.add(edge);
            const path = [{ c: start.col, r: start.row }];
            let prevCol = start.col;
            let prevRow = start.row;
            let curCol = first.col;
            let curRow = first.row;
            while (!isSpecial(curCol, curRow)) {
                path.push({ c: curCol, r: curRow });
                const midNeighbors = neighborsByIndex.get(layoutAbsCellIndex(layout, curCol, curRow));
                let nextCol = null;
                let nextRow = null;
                for (let mi = 0; mi < midNeighbors.length; mi++) {
                    const n = midNeighbors[mi];
                    if (n.col === prevCol && n.row === prevRow) continue;
                    nextCol = n.col;
                    nextRow = n.row;
                    break;
                }
                if (nextCol === null) break;
                usedEdges.add(undirectedEdgeIndex(curCol, curRow, nextCol, nextRow, layout));
                prevCol = curCol;
                prevRow = curRow;
                curCol = nextCol;
                curRow = nextRow;
            }
            path.push({ c: curCol, r: curRow });
            if (path.length >= 2) paths.push(path);
        }
    }
    if (paths.length === 0 && members.length > 0) {
        let allDegreeTwo = true;
        for (let i = 0; i < members.length; i++)
            if (degreeByIndex.get(layoutAbsCellIndex(layout, members[i].col, members[i].row)) !== 2) {
                allDegreeTwo = false;
                break;
            }
        if (allDegreeTwo) {
            const start = members[0];
            const loop = [{ c: start.col, r: start.row }];
            let prevCol = start.col;
            let prevRow = start.row;
            let curCol = start.col;
            let curRow = start.row;
            for (;;) {
                const midNeighbors = neighborsByIndex.get(layoutAbsCellIndex(layout, curCol, curRow));
                let nextCol = null;
                let nextRow = null;
                for (let mi = 0; mi < midNeighbors.length; mi++) {
                    const n = midNeighbors[mi];
                    if (n.col === prevCol && n.row === prevRow) continue;
                    nextCol = n.col;
                    nextRow = n.row;
                    break;
                }
                if (nextCol === null) break;
                if (nextCol === start.col && nextRow === start.row) {
                    loop.push({ c: start.col, r: start.row });
                    break;
                }
                loop.push({ c: nextCol, r: nextRow });
                prevCol = curCol;
                prevRow = curRow;
                curCol = nextCol;
                curRow = nextRow;
                if (loop.length > members.length + 1) break;
            }
            if (loop.length >= 3) paths.push(loop);
        }
    }
    return paths;
}
