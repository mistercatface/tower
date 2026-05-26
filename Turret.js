import { Utilities } from "./Utilities.js";

export class Turret {
    constructor(angle, turnSpeed) {
        this.angle = Utilities.normalizeAngle(angle);
        this.turnSpeed = turnSpeed;
        this.charge = 0;
        this.target = null;
    }
}