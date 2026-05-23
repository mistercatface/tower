export class Turret {
    constructor(angle, turnSpeed) {
        this.angle = angle;
        this.turnSpeed = turnSpeed;
        this.charge = 0;
        this.target = null;
    }
}