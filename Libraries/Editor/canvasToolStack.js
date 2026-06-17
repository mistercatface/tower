/**
 * @typedef {object} CanvasTool
 * @property {() => boolean} isActive
 * @property {() => boolean} [blocksPlacement]
 * @property {(world: { x: number, y: number }, e: PointerEvent) => boolean} [onPointerDown]
 * @property {(world: { x: number, y: number }, e: PointerEvent, clientToWorld: (clientX: number, clientY: number) => { x: number, y: number }) => void} [onPointerMove]
 * @property {(ctx: CanvasRenderingContext2D) => void} [drawOverlay]
 */
/**
 * @param {CanvasTool[]} tools
 * @param {{ clientToWorld: (clientX: number, clientY: number) => { x: number, y: number } }} options
 */
export function createCanvasToolStack(tools, { clientToWorld }) {
    return {
        blocksPlacement() {
            for (let i = 0; i < tools.length; i++) {
                const tool = tools[i];
                if (tool.isActive() && tool.blocksPlacement?.()) return true;
            }
            return false;
        },
        dispatchPointerDown(world, e) {
            for (let i = 0; i < tools.length; i++) {
                const tool = tools[i];
                if (!tool.isActive()) continue;
                if (tool.onPointerDown?.(world, e)) return true;
            }
            return false;
        },
        dispatchPointerMove(world, e) {
            for (let i = 0; i < tools.length; i++) {
                const tool = tools[i];
                if (!tool.isActive()) continue;
                tool.onPointerMove?.(world, e, clientToWorld);
            }
        },
        drawOverlays(ctx) {
            for (let i = 0; i < tools.length; i++) {
                const tool = tools[i];
                if (!tool.isActive()) continue;
                tool.drawOverlay?.(ctx);
            }
        },
    };
}
