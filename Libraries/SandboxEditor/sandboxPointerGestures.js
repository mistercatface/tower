import { releasePointerCapture } from "../Input/canvasPointer.js";
export function createSandboxPointerGestures({ getCanvas, session, clientToWorld }) {
    let interactionBehavior = null;
    return {
        hasCapture: () => interactionBehavior != null,
        reset() {
            interactionBehavior = null;
        },
        startPropInteraction(behavior, e) {
            interactionBehavior = behavior;
            getCanvas().setPointerCapture(e.pointerId);
        },
        capturesPointerMove: () => interactionBehavior != null,
        onPointerMove(_world, e) {
            if (!interactionBehavior) return;
            const prop = session.getSelectedProp();
            if (!prop) return;
            interactionBehavior.onPointerMove(prop, clientToWorld(e.clientX, e.clientY), e);
            e.stopPropagation();
        },
        onPointerUp(_world, e) {
            if (!interactionBehavior) return false;
            const prop = session.getSelectedProp();
            if (prop) {
                const world = clientToWorld(e.clientX, e.clientY);
                interactionBehavior.onPointerMove(prop, world, e);
                interactionBehavior.onPointerUp(prop, e);
            }
            interactionBehavior = null;
            releasePointerCapture(getCanvas(), e);
            e.stopPropagation();
            session.sync();
            return true;
        },
    };
}
