import { createGroundNavIntentAdapter } from "./createGroundNavIntentAdapter.js";
import { buildGroundNavIntentAdapterOptions } from "./createGroundNavIntentAdapter.js";
import { isSnakeFoodTarget } from "./snakeFood.js";

import { ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame } from "./snakePerception.js";
import { getObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
import { createSpatialCellMemory } from "../../AI/brain/brain.js";
export class Brain {
    constructor({ spatialMemoryCapacity = 64, cols = 64 } = {}) {
        this.spatial = createSpatialCellMemory({ capacity: spatialMemoryCapacity, cols });
    }
    stampSeenCells(cells) {
        this.spatial.stampCells(cells);
    }
    stampArrival(idx) {
        this.spatial.stamp(idx);
    }
    clearMemory() {
        this.spatial.clear();
    }
}
export function buildNavStepPenaltyFromSpatialMemory(spatial, { basePenalty, falloff }, keysBuffer = null, costsBuffer = null) {
    if (keysBuffer && costsBuffer) {
        let count = 0;
        spatial.forEachNewestFirstKey((key, _seq, rankFromNewest) => {
            if (count < keysBuffer.length) {
                keysBuffer[count] = key;
                costsBuffer[count] = basePenalty * (falloff ** rankFromNewest);
                count++;
            }
        });
        if (!count) return null;
        return { keys: keysBuffer.subarray(0, count), costs: costsBuffer.subarray(0, count) };
    }
    const keys = [];
    const costs = [];
    spatial.forEachNewestFirstKey((key, _seq, rankFromNewest) => {
        keys.push(key);
        costs.push(basePenalty * (falloff ** rankFromNewest));
    });
    if (!keys.length) return null;
    return { keys: Int32Array.from(keys), costs: Float32Array.from(costs) };
}
export function createSpatialBrainSync(brain, { visionRange, navMemoryStepPenalty, navMemoryStepFalloff }) {
    let lastPenaltyGeneration = -1;
    let lastPenalty = null;
    const capacity = brain.spatial.capacity;
    const keysBuffer = new Int32Array(capacity);
    const costsBuffer = new Float32Array(capacity);
    return function syncSpatialBrain(agent, state) {
        const frame = getObserverVisionFrame(state);
        const vision = frame.ensureHeadVision(agent, visionRange);
        brain.stampSeenCells(vision.cells);
        const generation = brain.spatial.generation;
        if (generation !== lastPenaltyGeneration) {
            lastPenalty = buildNavStepPenaltyFromSpatialMemory(brain.spatial, { basePenalty: navMemoryStepPenalty, falloff: navMemoryStepFalloff }, keysBuffer, costsBuffer);
            lastPenaltyGeneration = generation;
        }
        agent.navStepPenalty = lastPenalty;
    };
}
export class AgentAutosim {
    constructor(state, instance) {
        this.state = state;
        this.instance = instance;
        this.session = state.sandbox.snakeGame;
        this.shared = this.session.config.shared;
        this.entityRegistry = state.entityRegistry;
        this.agentCtx = { instance, session: this.session, navWalkable: this.session.navWalkable };
        this.profile = instance.profile;
        this.brain = new Brain({ spatialMemoryCapacity: this.shared.spatialMemoryCapacity, cols: state.obstacleGrid?.cols ?? 64 });
        this.sync = createSpatialBrainSync(this.brain, {
            visionRange: instance.visionRange,
            navMemoryStepPenalty: this.shared.navMemoryStepPenalty,
            navMemoryStepFalloff: this.shared.navMemoryStepFalloff,
        });
        this.intent = createGroundNavIntentAdapter(buildGroundNavIntentAdapterOptions({ state, instance, brain: this.brain, sync: this.sync, headNav: instance.headNav, agentCtx: this.agentCtx }));
        instance.intent = this.intent;
        instance.brain = this.brain;
        this.active = false;
        this.initialHunger = this.profile.initialHunger ?? 1;
    }
    start() {
        this.active = true;
        this.instance.sprinting = false;
        this.instance.metabolism.setHunger(this.initialHunger);
        this.intent.resetMode();
        this.intent.resetMemory();
    }
    stop() {
        this.active = false;
        this.instance.sprinting = false;
        this.intent.clear(this.instance.head, this.state);
    }
    isActive() {
        return this.active;
    }
    getPathOverlay() {
        return this.instance.headNav.getPathOverlay(this.instance.head);
    }
    tick(dtMs, admitted = true) {
        if (!this.active) return;
        const seeker = this.instance.head;
        if (this.instance.lifecycle !== "alive") return;
        if (!this.instance.isSteerable()) {
            this.instance.die(this.state);
            return;
        }
        const soloTick = !this.session._batchingPerception;
        if (this.session._batchingPerception) ensureSnakePerceptionTick(this.state);
        else maybeBeginSnakeAutosimTick(this.state);
        let choice;
        if (admitted) choice = this.intent.tick(seeker, this.state, dtMs);
        this.instance.applySprintMovementIntent();
        this.instance.headNav.tick(seeker, dtMs);
        if (soloTick) endSnakePerceptionFrame(this.state);
        let fedThisTick = false;
        let foodTarget = null;
        if (choice?.mode === "seek_food" && choice.target && isSnakeFoodTarget(choice.target)) foodTarget = choice.target;
        else if (this.intent.getMode() === "seek_food" && this.intent.getTargetId() != null) foodTarget = this.entityRegistry.getLive(this.intent.getTargetId());
        if (foodTarget) fedThisTick = this.instance.eatFoodTarget(this.state, foodTarget);
        let ammoTarget = null;
        if (choice?.mode === "seek_ammo" && choice.target && choice.target.type === "ammo_shard") ammoTarget = choice.target;
        else if (this.intent.getMode() === "seek_ammo" && this.intent.getTargetId() != null) ammoTarget = this.entityRegistry.getLive(this.intent.getTargetId());
        if (ammoTarget) this.instance.collectAmmoTarget(this.state, ammoTarget);
        const drainMultiplier = this.instance.hungerDrainMultiplier();
        if (!fedThisTick) this.instance.tickMetabolism(this.state, dtMs, drainMultiplier);
    }
}
