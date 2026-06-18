import { issueCursorGroundNavMove, updateCursorGroundNavMove } from "../Sandbox/groundNav/input/cursorGroundNav.js";
import { releasePointerCapture } from "../Input/canvasPointer.js";
export function createSandboxPointerGestures({ getCanvas, session, clientToWorld }) {
    let interactionBehavior = null;
    let groundNav = null;
    return {
        hasCapture: () => interactionBehavior != null || groundNav != null,
        reset() {
            interactionBehavior = null;
            groundNav = null;
        },
        startPropInteraction(behavior, e) {
            interactionBehavior = behavior;
            getCanvas().setPointerCapture(e.pointerId);
        },
        startGroundNav(move, world, e) {
            issueCursorGroundNavMove(move, world);
            groundNav = { prop: move.prop, behavior: move.behavior };
            getCanvas().setPointerCapture(e.pointerId);
        },
        capturesPointerMove: () => groundNav != null || interactionBehavior != null,
        onPointerMove(_world, e) {
            if (groundNav) {
                updateCursorGroundNavMove(groundNav, clientToWorld(e.clientX, e.clientY));
                return;
            }
            if (!interactionBehavior) return;
            const prop = session.getSelectedProp();
            if (!prop) return;
            interactionBehavior.onPointerMove(prop, clientToWorld(e.clientX, e.clientY), e);
            e.stopPropagation();
        },
        onPointerUp(_world, e) {
            if (groundNav) {
                const nav = groundNav;
                groundNav = null;
                releasePointerCapture(getCanvas(), e);
                updateCursorGroundNavMove(nav, clientToWorld(e.clientX, e.clientY));
                session.sync();
                return true;
            }
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
