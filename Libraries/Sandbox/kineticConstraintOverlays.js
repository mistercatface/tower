import { appendOverlayWireLink, overlayCachedWireEndpoint } from "../Render/overlays/overlayCommands.js";
import { distanceBetweenAnchors, worldAnchorFromBody } from "../Motion/constraintAnchors.js";
import { listKineticConstraints } from "../Motion/kineticConstraints.js";
function constraintWireColor(strain) {
    if (strain < 0.05) return "rgba(100, 255, 140, 0.85)";
    if (strain < 0.2) return "rgba(255, 220, 80, 0.9)";
    return "rgba(255, 80, 80, 0.95)";
}
export function appendKineticConstraintOverlayCommands(out, state) {
    const constraints = listKineticConstraints(state.kinetic);
    for (let i = 0; i < constraints.length; i++) {
        const entry = constraints[i];
        if (entry.type !== "distance") continue;
        const bodyA = state.entityRegistry.getLive(entry.bodyAId);
        const bodyB = state.entityRegistry.getLive(entry.bodyBId);
        if (!bodyA || !bodyB) continue;
        const wa = worldAnchorFromBody(bodyA, entry.anchorA.x, entry.anchorA.y);
        const wb = worldAnchorFromBody(bodyB, entry.anchorB.x, entry.anchorB.y);
        const dist = distanceBetweenAnchors(bodyA, entry.anchorA, bodyB, entry.anchorB);
        const strain = entry.restLength > 0 ? Math.abs(dist - entry.restLength) / entry.restLength : 0;
        const color = constraintWireColor(strain);
        out.push(overlayCachedWireEndpoint(wa.x, wa.y, 4, color));
        out.push(overlayCachedWireEndpoint(wb.x, wb.y, 4, color));
        appendOverlayWireLink(out, wa.x, wa.y, wb.x, wb.y, color, { lineWidth: 2, dash: [5, 4], endpointRadius: 4 });
    }
}
