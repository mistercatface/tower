import { attachKineticTestTickFromState } from "./kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../../Libraries/Spatial/collision/kineticContactSolver.js";
import { applyKineticContactSideEffects } from "../../Libraries/Spatial/collision/kineticContactSideEffects.js";
import { resolveSnakeCombatFromContacts } from "../../Libraries/Game/snake/snakeCombat.js";

import { getCirclePropRadius } from "../../Libraries/Props/propScale.js";

export function overlapCircleBodies(a, b, overlapPx = 2) {
    const radiusA = getCirclePropRadius(a) ?? a.radius ?? 0;
    const radiusB = getCirclePropRadius(b) ?? b.radius ?? 0;
    b.x = a.x + radiusA + radiusB - overlapPx;
    b.y = a.y;
}

export function resolveSnakeAgentPropContacts(state, props) {
    const tick = attachKineticTestTickFromState(state, props);
    const pairs = gatherKineticContactPairs(tick);
    resolveKineticContactPassWithPairs(tick, pairs);
    applyKineticContactSideEffects(tick, kineticContactBuffer);
    resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer);
}
