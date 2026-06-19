function cellKey(col, row) {
    return `${col},${row}`;
}

function undirectedEdgeKey(aCol, aRow, bCol, bRow) {
    const a = cellKey(aCol, aRow);
    const b = cellKey(bCol, bRow);
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function collectCorridorPathPolylines(cells, neighborAt) {
    const members = cells.slice();
    const memberSet = new Set();
    for (let i = 0; i < members.length; i++) memberSet.add(cellKey(members[i].col, members[i].row));
    const degreeByKey = new Map();
    const neighborsByKey = new Map();
    for (let i = 0; i < members.length; i++) {
        const cell = members[i];
        const key = cellKey(cell.col, cell.row);
        const neighbors = neighborAt(cell.col, cell.row).filter((n) => memberSet.has(cellKey(n.col, n.row)));
        neighborsByKey.set(key, neighbors);
        degreeByKey.set(key, neighbors.length);
    }
    const isSpecial = (col, row) => degreeByKey.get(cellKey(col, row)) !== 2;
    const usedEdges = new Set();
    const paths = [];
    for (let si = 0; si < members.length; si++) {
        const start = members[si];
        if (!isSpecial(start.col, start.row)) continue;
        const startNeighbors = neighborsByKey.get(cellKey(start.col, start.row));
        for (let ni = 0; ni < startNeighbors.length; ni++) {
            const first = startNeighbors[ni];
            const edge = undirectedEdgeKey(start.col, start.row, first.col, first.row);
            if (usedEdges.has(edge)) continue;
            usedEdges.add(edge);
            const path = [{ c: start.col, r: start.row }];
            let prevCol = start.col;
            let prevRow = start.row;
            let curCol = first.col;
            let curRow = first.row;
            while (!isSpecial(curCol, curRow)) {
                path.push({ c: curCol, r: curRow });
                const midNeighbors = neighborsByKey.get(cellKey(curCol, curRow));
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
                usedEdges.add(undirectedEdgeKey(curCol, curRow, nextCol, nextRow));
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
        for (let i = 0; i < members.length; i++) {
            if (degreeByKey.get(cellKey(members[i].col, members[i].row)) !== 2) {
                allDegreeTwo = false;
                break;
            }
        }
        if (allDegreeTwo) {
            const start = members[0];
            const loop = [{ c: start.col, r: start.row }];
            let prevCol = start.col;
            let prevRow = start.row;
            let curCol = start.col;
            let curRow = start.row;
            for (;;) {
                const midNeighbors = neighborsByKey.get(cellKey(curCol, curRow));
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
