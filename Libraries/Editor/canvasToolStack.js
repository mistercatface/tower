/**
 * @typedef {object} CanvasTool
 * @property {() => boolean} isActive
 * @property {() => boolean} [blocksPlacement]
 * @property {() => boolean} [isDragging]
 * @property {(world: { x: number, y: number }, e: PointerEvent) => boolean} [onPointerDown]
 * @property {(world: { x: number, y: number }, e: PointerEvent) => boolean} [tryBeginPointerDown]
 * @property {(world: { x: number, y: number }, e: PointerEvent, clientToWorld: (clientX: number, clientY: number) => { x: number, y: number }) => boolean} [onPointerUp]
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
        blocksPlacePreview() {
            for (let i = 0; i < tools.length; i++) {
                const tool = tools[i];
                if (tool.isDragging?.()) return true;
                if (tool.isActive() && tool.blocksPlacement?.()) return true;
            }
            return false;
        },
        isDragging() {
            for (let i = 0; i < tools.length; i++) if (tools[i].isDragging?.()) return true;
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
        tryBeginPointerDown(world, e) {
            for (let i = 0; i < tools.length; i++) if (tools[i].tryBeginPointerDown?.(world, e)) return true;
            return false;
        },
        dispatchPointerMove(world, e) {
            for (let i = 0; i < tools.length; i++) {
                const tool = tools[i];
                if (tool.isActive()) tool.onPointerMove?.(world, e, clientToWorld);
                else if (tool.isDragging?.()) tool.onPointerMove?.(world, e, clientToWorld);
            }
        },
        dispatchPointerUp(world, e) {
            for (let i = 0; i < tools.length; i++) if (tools[i].onPointerUp?.(world, e, clientToWorld)) return true;
            return false;
        },
        drawOverlays(ctx) {
            for (let i = 0; i < tools.length; i++) tools[i].drawOverlay?.(ctx);
        },
    };
}
