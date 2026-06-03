export class GlobalAlertState {
    constructor() {
        this.chaseEndTime = -1;
        this.lastKnownTargetX = null;
        this.lastKnownTargetY = null;
        this.chaseDurationMs = 10000;
    }

    setLastKnownTarget(x, y) {
        this.lastKnownTargetX = x;
        this.lastKnownTargetY = y;
    }

    startChase(x, y, state) {
        this.setLastKnownTarget(x, y);
        this.chaseEndTime = (state?.gameTime ?? 0) + this.chaseDurationMs;
    }

    isChaseActive(state) {
        return (state?.gameTime ?? 0) < this.chaseEndTime;
    }
}
