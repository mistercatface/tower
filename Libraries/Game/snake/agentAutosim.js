import { createBrain } from "../../AI/brain/createBrain.js";
import { createSpatialBrainSync } from "../../AI/brain/syncSpatialBrain.js";
import { createGroundNavIntentAdapter } from "./createGroundNavIntentAdapter.js";
import { buildGroundNavIntentAdapterOptions } from "./createGroundNavIntentAdapter.js";
import { isSnakeFoodTarget } from "./snakeFood.js";
import { setAgentHunger } from "./agentMetabolism.js";
import { ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame } from "./snakePerception.js";
export class AgentAutosim {
    constructor(state, instance) {
        this.state = state;
        this.instance = instance;
        this.session = state.sandbox.snakeGame;
        this.shared = this.session.config.shared;
        this.entityRegistry = state.entityRegistry;
        this.agentCtx = { instance, session: this.session, navWalkable: this.session.navWalkable };
        this.profile = instance.profile;
        this.brain = createBrain({ spatialMemoryCapacity: this.shared.spatialMemoryCapacity });
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
        setAgentHunger(this.instance.metabolism, this.initialHunger);
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
export function createAgentAutosim(state, instance) {
    return new AgentAutosim(state, instance);
}
