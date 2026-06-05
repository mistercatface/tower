import { SeparationEngine } from "./SeparationEngine.js";

const defaultEngine = new SeparationEngine();

/** @returns {{ x: number, y: number, pushX: number, pushY: number }} */
export function createSeparationState() {
    return { x: 0, y: 0, pushX: 0, pushY: 0 };
}

/**
 * Compute separation forces for one body and write into body.separation.
 *
 * @param {{ x: number, y: number, radius: number, separation?: { x: number, y: number, pushX: number, pushY: number } }} body
 * @param {{ getNeighbors: (entity: object) => object[] }} spatialFrame
 * @param {SeparationEngine} [engine]
 */
export function updateSeparation(body, spatialFrame, engine = defaultEngine) {
    if (!body.separation) body.separation = createSeparationState();
    const acc = engine.compute(body, spatialFrame.getNeighbors(body));
    body.separation.x = acc.x;
    body.separation.y = acc.y;
    body.separation.pushX = acc.pushX;
    body.separation.pushY = acc.pushY;
}
