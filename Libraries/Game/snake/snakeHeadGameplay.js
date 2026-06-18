import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function applySnakeHeadGameplay(head) {
    const headMaxSpeed = getSnakeGameConfig().headMaxSpeed;
    if (headMaxSpeed == null) return;
    head.strategy.groundNav = { ...head.strategy.groundNav, maxSpeed: headMaxSpeed };
}
