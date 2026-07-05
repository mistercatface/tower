import { MAX_ENTITIES as MAX_KINETIC_PAIRS } from "../../Core/engineLimits.js";

export function createKineticPairBuffer() {
    return {
        count: 0,
        physIdA: new Int32Array(MAX_KINETIC_PAIRS),
        physIdB: new Int32Array(MAX_KINETIC_PAIRS),
        static: { tier: new Uint8Array(MAX_KINETIC_PAIRS) },
        reset() {
            this.count = 0;
        },
    };
}
