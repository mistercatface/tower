import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { syncKineticRigidBody } from "../../Motion/bodyMass.js";
export function applySnakeHeadGameplay(head) {
    const config = getSnakeGameConfig();
    const headMaxSpeed = config.headMaxSpeed;
    if (headMaxSpeed != null) head.strategy.groundNav = { ...head.strategy.groundNav, maxSpeed: headMaxSpeed };
    if (config.headAccel != null) head.strategy.groundNav = { ...head.strategy.groundNav, accel: config.headAccel };
    if (config.headFriction != null) head.strategy.friction = config.headFriction;
}
export function applySnakeSegmentGameplay(segment) {
    const config = getSnakeGameConfig();
    if (config.segmentFriction != null) segment.strategy.friction = config.segmentFriction;
    if (config.segmentDensity != null) {
        segment.strategy.density = config.segmentDensity;
        if (segment.strategy.isKinetic) syncKineticRigidBody(segment);
    }
}
