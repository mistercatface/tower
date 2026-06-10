/**
 * Runtime adapter from the editor sandbox host to registered toys.
 *
 * @typedef {object} SandboxHostPort
 * @property {() => HTMLCanvasElement} getCanvas
 * @property {(clientX: number, clientY: number) => { x: number, y: number }} clientToWorld
 * @property {() => boolean} [isInputBlocked]
 * @property {() => { x: number, y: number }} getCameraOrigin
 * @property {() => void} requestRedraw
 * @property {(startX: number, startY: number, targetX: number, targetY: number) => { waypoints: { x: number, y: number }[], abstractNodes?: object[], pathPlanner?: "local" | "hpa" } | null} computePath
 * @property {() => object[]} getPickups
 * @property {(prop: object) => void} addPickup
 * @property {(prop: object) => void} removePickup
 * @property {() => void} clearPickups
 * @property {() => object} getWorldState
 */
export {};
