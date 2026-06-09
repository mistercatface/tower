/**
 * Game-side HPA replan hooks — visibility and off-screen replan scaling.
 *
 * @param {{ viewport: import("../../Libraries/Viewport/Viewport.js").Viewport }} state
 * @returns {{ isVisible: (entity: object) => boolean, getReplanScale: (entity: object) => number }}
 */
export function createHpaHooks(state) {
    const { viewport } = state;
    return {
        isVisible: (entity) => viewport.isVisible(entity.x, entity.y, entity.radius, 128),
        getReplanScale: (entity) => (viewport.isVisible(entity.x, entity.y, entity.radius, 128) ? 1 : 10),
    };
}
