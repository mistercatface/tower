import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityGrid } from "../Libraries/Spatial/spatial.js";
import { SHAPE_TYPE_CIRCLE } from "../Core/engineEnums.js";
import {
    entityX,
    entityY,
    entityR,
    entityAlive,
    entityRefs,
    entityGridTileIdx,
    kineticDynamicSlab,
} from "../Core/engineMemory.js";

const EID_A = 10;
const EID_B = 11;

function stampCircle(eid, x, y, r) {
    entityAlive[eid] = 1;
    entityRefs[eid] = { _physId: eid };
    entityX[eid] = x;
    entityY[eid] = y;
    entityR[eid] = r;
    kineticDynamicSlab.shapeKind[eid] = SHAPE_TYPE_CIRCLE;
    kineticDynamicSlab.r[eid] = r;
}

describe("entity grid eid", () => {
    it("insert and collectNearbyEidsInto use entityX/entityY not prop bags", () => {
        const grid = new EntityGrid(50);
        grid.syncBounds({ minX: -250, maxX: 250, minY: -250, maxY: 250 });
        stampCircle(EID_A, 0, 0, 10);
        stampCircle(EID_B, 24, 0, 8);
        grid.insert(EID_A);
        grid.insert(EID_B);
        assert.equal(entityGridTileIdx[EID_A], grid._getCellIndex(0, 0));
        assert.equal(entityGridTileIdx[EID_B], grid._getCellIndex(24, 0));
        const out = new Int32Array(8);
        const count = grid.collectNearbyEidsInto(EID_A, out, out.length);
        assert.ok(count >= 1);
        let found = false;
        for (let i = 0; i < count; i++) if (out[i] === EID_B) found = true;
        assert.ok(found);
    });

    it("remove+insert after SoA teleport updates cell membership", () => {
        const grid = new EntityGrid(50);
        grid.syncBounds({ minX: -250, maxX: 250, minY: -250, maxY: 250 });
        stampCircle(EID_A, 0, 0, 10);
        grid.insert(EID_A);
        const fromIdx = entityGridTileIdx[EID_A];
        entityX[EID_A] = 120;
        entityY[EID_A] = 80;
        grid.remove(EID_A);
        grid.insert(EID_A);
        const toIdx = entityGridTileIdx[EID_A];
        assert.notEqual(toIdx, fromIdx);
        assert.equal(toIdx, grid._getCellIndex(120, 80));
        assert.equal(entityGridTileIdx[EID_A], toIdx);
    });
});
