export function createWireLinkTool({ getEnterCursor, onLinkClick, onSync }) {
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
    };
}
