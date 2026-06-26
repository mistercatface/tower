import { createBrain } from "../../AI/brain/createBrain.js";
import { createSpatialBrainSync } from "../../AI/brain/syncSpatialBrain.js";
import { createGroundNavIntentAdapter } from "./createGroundNavIntentAdapter.js";
import { buildGroundNavIntentAdapterOptions } from "./createGroundNavIntentAdapter.js";
import { createCellTargetHpaNav } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { isSnakeFoodTarget } from "./snakeFood.js";
import { createAgentMetabolism, getAgentHunger, setAgentHunger } from "./agentMetabolism.js";
import { ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame } from "./snakePerception.js";
export function createAgentAutosim(state, instance) {
    const session = state.sandbox.snakeGame;
    const shared = session.config.shared;
    const entityRegistry = state.entityRegistry;
    const agentCtx = { instance, session, navWalkable: session.navWalkable };
    const profile = instance.profile;
    const metabolism = createAgentMetabolism(profile);
    const brain = createBrain({ spatialMemoryCapacity: shared.spatialMemoryCapacity });
    const sync = createSpatialBrainSync(brain, { visionRange: instance.visionRange, navMemoryStepPenalty: shared.navMemoryStepPenalty, navMemoryStepFalloff: shared.navMemoryStepFalloff });
    instance.headNav = createCellTargetHpaNav(state);
    const baseMaxSpeed = instance.leaderGameplay.maxSpeed;
    const baseAccel = instance.leaderGameplay.accel;
    const sprint = profile.sprint ?? {};
    const intent = createGroundNavIntentAdapter(buildGroundNavIntentAdapterOptions({ state, instance, brain, sync, headNav: instance.headNav, agentCtx }));
    instance.intent = intent;
    instance.brain = brain;
    instance.metabolism = metabolism;
    let active = false;
    const initialHunger = profile.initialHunger ?? 1;
    const autosim = {
        start() {
            active = true;
            instance.sprinting = false;
            setAgentHunger(metabolism, initialHunger);
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
            instance.sprinting = intent.getDecisionContext()?.sprintIntent?.want === true && getAgentHunger(metabolism) > 0;
            seeker.strategy.groundNav.maxSpeed = instance.sprinting ? baseMaxSpeed * sprint.speedMultiplier : baseMaxSpeed;
            seeker.strategy.groundNav.accel = instance.sprinting ? baseAccel * sprint.accelMultiplier : baseAccel;
            instance.headNav.tick(seeker, dtMs);
            if (soloTick) endSnakePerceptionFrame(state);
            let fedThisTick = false;
            let foodTarget = null;
            if (choice?.mode === "seek_food" && choice.target && isSnakeFoodTarget(choice.target)) foodTarget = choice.target;
            else if (intent.getMode() === "seek_food" && intent.getTargetId() != null) foodTarget = entityRegistry.getLive(intent.getTargetId());
            if (foodTarget) fedThisTick = instance.eatFoodTarget(state, foodTarget);
            const drainMultiplier = instance.sprinting ? (sprint.hungerDrainMultiplier ?? 1) : 1;
            if (!fedThisTick) instance.tickMetabolism(state, dtMs, drainMultiplier);
        },
    };
    return autosim;
}
