import { releasePointerCapture } from "../Input/canvasPointer.js";
export function createMarqueeSelectTool({ clickThresholdPx = 4, getCanvas, writeAabbFromDrag, canBegin, onClick, onBoxSelect }) {
    let drag = null;
    return {
        isActive: () => false,
        blocksPlacement: () => false,
        isDragging: () => drag != null,
        writeMarqueeAabb() {
            if (!drag) return false;
            writeAabbFromDrag(drag.startWorld, drag.currentWorld);
            return true;
        },
        tryBeginPointerDown(world, e) {
            if (e.button !== 0) return false;
            if (canBegin && !canBegin(e)) return false;
            drag = { pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startWorld: world, currentWorld: world };
            getCanvas().setPointerCapture(e.pointerId);
            return true;
        },
        onPointerMove(_world, e, clientToWorld) {
            if (!drag) return;
            drag.currentWorld = clientToWorld(e.clientX, e.clientY);
        },
        onPointerUp(_world, e, clientToWorld) {
            if (!drag) return false;
            const currentDrag = drag;
            drag = null;
            releasePointerCapture(getCanvas(), e);
            const endWorld = clientToWorld(e.clientX, e.clientY);
            const dragPx = Math.hypot(e.clientX - currentDrag.startClientX, e.clientY - currentDrag.startClientY);
            if (dragPx < clickThresholdPx) onClick(endWorld, e);
            else {
                writeAabbFromDrag(currentDrag.startWorld, endWorld);
                onBoxSelect(e);
            }
            return true;
        },
        cancel() {
            drag = null;
        },
    };
}
