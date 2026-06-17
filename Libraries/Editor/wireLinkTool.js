/**
 * Click-to-link canvas mode: cursor follows pointer; each primary click commits a link.
 *
 * @param {{
 *   getEnterCursor: () => { x: number, y: number },
 *   onLinkClick: (world: { x: number, y: number }) => void,
 *   onSync?: () => void,
 *   drawWire: (ctx: CanvasRenderingContext2D, cursor: { x: number, y: number } | null) => void,
 * }} options
 */
export function createWireLinkTool({ getEnterCursor, onLinkClick, onSync, drawWire }) {
    let active = false;
    let cursor = null;
    const enter = () => {
        active = true;
        cursor = getEnterCursor();
        onSync?.();
    };
    const exit = () => {
        if (!active) return;
        active = false;
        cursor = null;
        onSync?.();
    };
    return {
        isActive: () => active,
        blocksPlacement: () => active,
        getCursor: () => cursor,
        enter,
        exit,
        onPointerDown(world, e) {
            if (!active || e.button !== 0) return false;
            onLinkClick(world);
            onSync?.();
            return true;
        },
        onPointerMove(_world, e, clientToWorld) {
            if (!active) return;
            cursor = clientToWorld(e.clientX, e.clientY);
        },
        drawOverlay(ctx) {
            if (!active) return;
            drawWire(ctx, cursor);
        },
    };
}
