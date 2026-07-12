import { satCheckShapesAtPose } from "../../Libraries/Physics/physics.js";

export function satCheckCollision(xA, yA, angleA, shapeA, xB, yB, angleB, shapeB) {
    return satCheckShapesAtPose(xA, yA, Math.cos(angleA), Math.sin(angleA), shapeA, xB, yB, Math.cos(angleB), Math.sin(angleB), shapeB);
}
