/**
 * Game-side HPA replan hooks — visibility and off-screen replan scaling.
 *
 * @param {object | null} state
 * @returns {{ isVisible: (entity: object) => boolean, getReplanScale: (entity: object) => number }}
 */
export function createHpaHooks(state) {
    const viewport = state?.fsm?.context?.viewport ?? null;
    return {
        isVisible: (entity) => {
            if (!viewport) return true;
            return viewport.isVisible(entity.x, entity.y, entity.radius, 128);
        },
        getReplanScale: (entity) => {
            if (!viewport) return 1;
            return viewport.isVisible(entity.x, entity.y, entity.radius, 128) ? 1 : 10;
        },
    };
}
