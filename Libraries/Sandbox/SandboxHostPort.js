/**
 * Runtime adapter from a sandbox host (Tile Lab, future playground) to a registered toy.
 *
 * @typedef {object} SandboxHostPort
 * @property {() => HTMLCanvasElement | null} getCanvas
 * @property {(clientX: number, clientY: number) => { x: number, y: number } | null} clientToWorld
 * @property {() => boolean} isInputBlocked
 * @property {() => void} requestRedraw
 * @property {() => string} getFocusedPropId
 * @property {() => object[]} getPickups
 * @property {(prop: object) => void} addPickup
 * @property {() => void} clearPickups
 */
export {};
