import { tickAgentIntent, reapAgentInstance } from "../snakeAgentLifecycle.js";
import { createHornSatelliteIntent } from "./createHornSatelliteIntent.js";
import { grantSnakeSteeringLease, revokeSnakeSteeringLease } from "../snakeSteeringLease.js";
import { getSnakeGameConfig, applyHornSatelliteGameplay } from "../snakeGameConfig.js";
export class HornSatelliteInstance {
    constructor({ headId, spawnGroupId, mountBallId = null }) {
        this.headId = headId;
        this.spawnGroupId = spawnGroupId;
        this.mountBallId = mountBallId;
        this.lifecycle = "alive";
    }
    start(state) {
        grantSnakeSteeringLease(this, state);
        const snakeGame = state.sandbox.snakeGame;
        this.intent = createHornSatelliteIntent({ selfHeadId: this.headId, spawnGroupId: this.spawnGroupId, registry: snakeGame.registry, instance: this });
        const horn = state.entityRegistry.getLive(this.headId);
        if (horn) applyHornSatelliteGameplay(horn);
        if (this.mountBallId) this.intent.resetMode(horn, state);
    }
    stopSteering(state) {
        revokeSnakeSteeringLease(this, state);
        const horn = state.entityRegistry.getLive(this.headId);
        if (this.intent) this.intent.clearIntent(horn, state);
    }
    tick(state, dtMs) {
        if (this.lifecycle !== "alive" || !this.intent) return;
        tickAgentIntent(state, this.intent, dtMs, (head) => {
            this.intent.tick(head, state);
        });
    }
    syncMembers(state) {
        return [this.headId];
    }
    validate(state, snakeGame) {
        if (this.lifecycle !== "alive") return;
        const horn = state.entityRegistry.getLive(this.headId);
        if (!horn || horn.isDead) {
            this.die(state, snakeGame);
            return;
        }
        if (this.mountBallId) {
            const mount = state.entityRegistry.getLive(this.mountBallId);
            if (!mount || mount.isDead) {
                this.mountBallId = null;
                this.intent?.resetMode(horn, state);
            }
        }
    }
    die(state, snakeGame, members = null, deathImpact = null) {
        reapAgentInstance(state, snakeGame, this, deathImpact);
    }
}
export function createHornSatelliteInstance(state, { headId, spawnGroupId, mountBallId = null }) {
    return new HornSatelliteInstance({ headId, spawnGroupId, mountBallId });
}
export function getHornSatelliteInstance(snakeGame, headId) {
    return snakeGame.instancesByHeadId.get(headId) ?? null;
}
