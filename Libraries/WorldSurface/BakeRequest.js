/**
 * Offscreen surface bake — single struct for pixel paint + animated profile resolve.
 */
/**
 * @typedef {Object} BakeRequest
 * @property {CanvasRenderingContext2D} ctx
 * @property {number} width
 * @property {number} height
 * @property {number} startWorldX
 * @property {number} startWorldY
 * @property {number} seed
 * @property {object} paintOptions
 * @property {string | object} profileOrId
 * @property {object} [resolvePayload]
 * @property {string} [profileKey]
 * @property {object} [baseProfile]
 */
/** @param {BakeRequest} spec @returns {BakeRequest} */
export function createBakeRequest(spec) {
    return spec;
}
