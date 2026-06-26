import { createBrain } from "../../AI/brain/createBrain.js";
import { createSpatialBrainSync } from "../../AI/brain/syncSpatialBrain.js";
import { createGroundNavIntentAdapter } from "./createGroundNavIntentAdapter.js";
import { buildGroundNavIntentAdapterOptions } from "./createGroundNavIntentAdapter.js";
import { isSnakeFoodTarget } from "./snakeFood.js";
import { setAgentHunger } from "./agentMetabolism.js";
import { ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame } from "./snakePerception.js";
export function createAgentAutosim(state, instance) {
    const session = state.sandbox.snakeGame;
    const shared = session.config.shared;
    const entityRegistry = state.entityRegistry;
    const agentCtx = { instance, session, navWalkable: session.navWalkable };
    const profile = instance.profile;
    const brain = createBrain({ spatialMemoryCapacity: shared.spatialMemoryCapacity });
    const sync = createSpatialBrainSync(brain, { visionRange: instance.visionRange, navMemoryStepPenalty: shared.navMemoryStepPenalty, navMemoryStepFalloff: shared.navMemoryStepFalloff });
    const intent = createGroundNavIntentAdapter(buildGroundNavIntentAdapterOptions({ state, instance, brain, sync, headNav: instance.headNav, agentCtx }));
    instance.intent = intent;
    instance.brain = brain;
    let active = false;
    const initialHunger = profile.initialHunger ?? 1;
    const autosim = {
        start() {
            active = true;
            instance.sprinting = false;
            setAgentHunger(instance.metabolism, initialHunger);
            intent.resetMode();
            intent.resetMemory();
        },
        stop() {
            active = false;
            instance.sprinting = false;
            intent.clear(instance.head, state);
        },
        isActive() {
            return active;
        },
        getPathOverlay() {
            return instance.headNav.getPathOverlay(instance.head);
        },
        tick(dtMs, admitted = true) {
            if (!active) return;
            const seeker = instance.head;
            if (instance.lifecycle !== "alive") return;
            if (!instance.isSteerable()) {
                instance.die(state);
                return;
            }
            const soloTick = !session._batchingPerception;
            if (session._batchingPerception) ensureSnakePerceptionTick(state);
            else maybeBeginSnakeAutosimTick(state);
            let choice;
            if (admitted) choice = intent.tick(seeker, state, dtMs);
            instance.applySprintMovementIntent();
            instance.headNav.tick(seeker, dtMs);
            if (soloTick) endSnakePerceptionFrame(state);
            let fedThisTick = false;
            let foodTarget = null;
            if (choice?.mode === "seek_food" && choice.target && isSnakeFoodTarget(choice.target)) foodTarget = choice.target;
            else if (intent.getMode() === "seek_food" && intent.getTargetId() != null) foodTarget = entityRegistry.getLive(intent.getTargetId());
            if (foodTarget) fedThisTick = instance.eatFoodTarget(state, foodTarget);
            const drainMultiplier = instance.hungerDrainMultiplier();
            if (!fedThisTick) instance.tickMetabolism(state, dtMs, drainMultiplier);
        },
    };
    return autosim;
}
