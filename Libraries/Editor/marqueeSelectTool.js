import { releasePointerCapture } from "../Input/canvasPointer.js";
/**
 * @param {{
 *   clickThresholdPx?: number,
 *   getCanvas: () => HTMLCanvasElement,
 *   buildAabbFromDrag: (startWorld: { x: number, y: number }, endWorld: { x: number, y: number }) => import("../Math/Aabb2D.js").Aabb2D,
 *   onClick: (world: { x: number, y: number }, e: PointerEvent) => void,
 *   onBoxSelect: (bounds: import("../Math/Aabb2D.js").Aabb2D, e: PointerEvent) => void,
 *   drawMarquee: (ctx: CanvasRenderingContext2D, bounds: import("../Math/Aabb2D.js").Aabb2D) => void,
 * }} options
 */
export function createMarqueeSelectTool({ clickThresholdPx = 4, getCanvas, buildAabbFromDrag, onClick, onBoxSelect, drawMarquee }) {
    let drag = null;
    const getMarqueeRect = () => {
        if (!drag) return null;
        return buildAabbFromDrag(drag.startWorld, drag.currentWorld);
    };
    return {
        isActive: () => false,
        blocksPlacement: () => false,
        isDragging: () => drag != null,
        getMarqueeRect,
        tryBeginPointerDown(world, e) {
            if (e.button !== 0) return false;
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
            else onBoxSelect(buildAabbFromDrag(currentDrag.startWorld, endWorld), e);
            return true;
        },
        drawOverlay(ctx) {
            const rect = getMarqueeRect();
            if (rect) drawMarquee(ctx, rect);
        },
        cancel() {
            drag = null;
        },
    };
}
