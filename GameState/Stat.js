export class Stat {
    constructor(baseValue, min = -Infinity, max = Infinity) {
        this.baseValue = baseValue;
        this.min = min;
        this.max = max;
        this.flatModifiers = 0;
        this.multiplierModifiers = 1.0;
    }

    get value() {
        let val = (this.baseValue + this.flatModifiers) * this.multiplierModifiers;
        return Math.max(this.min, Math.min(this.max, val));
    }

    reset() {
        this.flatModifiers = 0;
        this.multiplierModifiers = 1.0;
    }
}
