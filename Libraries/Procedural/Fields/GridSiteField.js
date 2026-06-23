import { hashSaltString } from "../../Math/hash.js";
import { writeSeededFeatureCell } from "./SeededFeatureHash.js";
const jitterScratch = { fx: 0, fy: 0 };
const rankScratch = { fx: 0, fy: 0 };
export class GridSiteField {
    constructor(rootSeed, salt, cellSize = 1) {
        this.jitterSeed = hashSaltString(rootSeed, `${salt}:jitter`);
        this.rankSeed = hashSaltString(rootSeed, `${salt}:rank`);
        this.cellSize = cellSize;
    }
    writeSite(out, col, row) {
        writeSeededFeatureCell(jitterScratch, col, row, this.jitterSeed);
        out.col = col;
        out.row = row;
        out.jitterX = jitterScratch.fx;
        out.jitterY = jitterScratch.fy;
        out.x = (col + jitterScratch.fx) * this.cellSize;
        out.y = (row + jitterScratch.fy) * this.cellSize;
        out.rank = this.rankCell(col, row);
        return out;
    }
    site(col, row) {
        return this.writeSite({ col: 0, row: 0, jitterX: 0, jitterY: 0, x: 0, y: 0, rank: 0 }, col, row);
    }
    rankCell(col, row) {
        writeSeededFeatureCell(rankScratch, col, row, this.rankSeed);
        return (rankScratch.fx + rankScratch.fy) * 0.5;
    }
    compareCells(aCol, aRow, bCol, bRow) {
        const ar = this.rankCell(aCol, aRow);
        const br = this.rankCell(bCol, bRow);
        if (ar !== br) return ar < br ? -1 : 1;
        if (aRow !== bRow) return aRow - bRow;
        return aCol - bCol;
    }
    sortedCells(cells) {
        return [...cells].sort((a, b) => this.compareCells(a.col, a.row, b.col, b.row));
    }
}
