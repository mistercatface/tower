/**
 * Runtime adapter from the editor sandbox host to registered toys.
 *
 * @typedef {object} SandboxHostPort
 * @property {() => HTMLCanvasElement} getCanvas
 * @property {(clientX: number, clientY: number) => { x: number, y: number }} clientToWorld
 * @property {() => { x: number, y: number }} getCameraOrigin
 * @property {() => void} requestRedraw
 * @property {(startX: number, startY: number, targetX: number, targetY: number) => { waypoints: { x: number, y: number }[], abstractNodes?: object[], pathPlanner?: "local" | "hpa" } | null} computePath
 * @property {(fn: (prop: object) => void) => void} forEachWorldProp
 * @property {(prop: object) => void} addProp
 * @property {(prop: object) => void} removeProp
 * @property {() => void} clearProps
 * @property {() => object} getWorldState
 */
export {};
