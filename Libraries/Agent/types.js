/**
 * Cross-cutting locomotion / navigation data contracts.
 * Not a game Entity — duck-typed objects or initMobileAgent() on an existing host.
 */
/**
 * Minimal pose for planning and steering math (path follow, flow sample, direct seek).
 * @typedef {object} AgentPose
 * @property {number} x
 * @property {number} y
 * @property {number} [radius]
 */
/**
 * Full top-down mobile body: pose + velocity, desired direction, and integration params.
 * @typedef {AgentPose & {
 *   vx?: number,
 *   vy?: number,
 *   desiredX: number,
 *   desiredY: number,
 *   speed: number,
 *   accelRate: number,
 *   angle: number,
 *   turnSpeed?: number,
 *   mass?: number,
 * }} MobileAgent
 */
/**
 * Output of pure nav / steering compute — apply via applySteeringResult at the game boundary.
 * @typedef {object} SteeringResult
 * @property {number} desiredX
 * @property {number} desiredY
 * @property {boolean} [offPath]
 */
export {};
