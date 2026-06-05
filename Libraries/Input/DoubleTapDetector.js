export class DoubleTapDetector {
    /** @param {number} timeoutMs */
    constructor(timeoutMs) {
        this.timeoutMs = timeoutMs;
        this._lastTapTime = 0;
    }

    /**
     * @param {number} [now]
     * @returns {boolean}
     */
    registerTap(now = Date.now()) {
        const isDoubleTap = now - this._lastTapTime < this.timeoutMs;
        this._lastTapTime = now;
        return isDoubleTap;
    }
}
