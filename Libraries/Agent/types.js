/**
 * Cross-cutting navigation data contracts.
 */
/**
 * Minimal pose for planning and steering math (path follow, flow sample, direct seek).
 * @typedef {object} AgentPose
 * @property {number} x
 * @property {number} y
 * @property {number} [radius]
 */
/**
 * Output of pure nav / steering compute — consumed by sandbox roll behaviors.
 * @typedef {object} SteeringResult
 * @property {number} desiredX
 * @property {number} desiredY
 * @property {boolean} [offPath]
 */
export {};
