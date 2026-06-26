export function createAgentFrameOrchestrator(config) {
    return {
        config,
        frameId: 0,
        thinksUsed: 0,
        spreadFrames: 1,
        beginFrame(frameId, agentCount = 0) {
            this.frameId = frameId;
            this.thinksUsed = 0;
            const budget = Math.max(1, this.config.thinkPerFrame);
            this.spreadFrames = Math.max(1, Math.ceil(agentCount / budget));
        },
        shouldThink(instance, state, viewport) {
            const head = instance.head;
            if (!head || head.isDead) return false;
            const isFocused = state.followCamera?.targetProp?.id === head.id;
            if (isFocused && this.config.focusedThinkEveryFrame) {
                this.thinksUsed++;
                instance._lastThinkFrame = this.frameId;
                return true;
            }
            const onScreen = viewport.circleInBounds(head.x, head.y, head.radius * 2, "props");
            const interval = onScreen ? this.config.onScreenThinkInterval : this.config.offScreenThinkInterval;
            const framesSince = this.frameId - (instance._lastThinkFrame ?? -999);
            if (this.frameId % this.spreadFrames !== head.id % this.spreadFrames) return false;
            if (framesSince >= interval)
                if (this.thinksUsed < this.config.thinkPerFrame) {
                    this.thinksUsed++;
                    instance._lastThinkFrame = this.frameId;
                    return true;
                }
            return false;
        },
        endFrame() {
            // Hook for future end-of-frame telemetry or diagnostics
        },
    };
}
