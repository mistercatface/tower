/**
 * Two-click wire mode: first pick sets the anchor, second pick commits; cursor follows pointer between picks.
 *
 * @param {{
 *   getEnterCursor: () => { x: number, y: number },
 *   pickAnchor: (world: { x: number, y: number }) => number | string | null,
 *   commitLink: (fromAnchorId: number | string, toAnchorId: number | string) => boolean,
 *   onAfterCommit?: () => void,
 *   onSync?: () => void,
 * }} options
 */
export function createTwoAnchorWireTool({ getEnterCursor, pickAnchor, commitLink, onAfterCommit, onSync }) {
    let active = false;
    let fromAnchorId = null;
    let cursor = null;
    const enter = () => {
        active = true;
        fromAnchorId = null;
        cursor = getEnterCursor();
        onSync?.();
    };
    const exit = () => {
        if (!active) return;
        active = false;
        fromAnchorId = null;
        cursor = null;
        onSync?.();
    };
    return {
        isActive: () => active,
        blocksPlacement: () => active,
        getFromAnchorId: () => fromAnchorId,
        getCursor: () => cursor,
        enter,
        exit,
        onPointerDown(world, e) {
            if (!active || e.button !== 0) return false;
            const anchorId = pickAnchor(world);
            if (anchorId != null)
                if (fromAnchorId == null) fromAnchorId = anchorId;
                else if (anchorId !== fromAnchorId && commitLink(fromAnchorId, anchorId)) onAfterCommit?.();
            onSync?.();
            return true;
        },
        onPointerMove(_world, e, clientToWorld) {
            if (!active) return;
            cursor = clientToWorld(e.clientX, e.clientY);
        },
    };
}
