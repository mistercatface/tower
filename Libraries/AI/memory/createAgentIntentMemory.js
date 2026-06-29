import { isAgentEngaged } from "../agents/AgentProfiles.js";
import { TargetMemory, targetFromMemoryRecord } from "./targetMemory.js";
const INTENT_MEMORY_KINDS = ["threat", "prey", "food", "ally"];
function allyIfEngaged(session, ally) {
    if (!ally) return null;
    if (session && !isAgentEngaged(session, ally.id)) return null;
    return ally;
}
function mergeTarget(visibleWorld, kind, record, state) {
    return visibleWorld[kind] ?? targetFromMemoryRecord(record, state);
}
function mergeAlly(visibleWorld, record, state, session, filterAllyForEngagement) {
    if (!filterAllyForEngagement) return mergeTarget(visibleWorld, "ally", record, state);
    let ally = allyIfEngaged(session, visibleWorld.ally) ?? targetFromMemoryRecord(record, state);
    return allyIfEngaged(session, ally);
}
export class AgentIntentMemory {
    constructor({ threatTtlTicks = 45, preyTtlTicks = 90, foodTtlTicks = 180, allyTtlTicks = 60, filterAllyForEngagement = false } = {}) {
        this.filterAllyForEngagement = filterAllyForEngagement;
        this.memory = new TargetMemory(INTENT_MEMORY_KINDS, { threat: threatTtlTicks, prey: preyTtlTicks, food: foodTtlTicks, ally: allyTtlTicks });
        this.memorySource = { threat: false, prey: false, food: false, ally: false };
        this.world = { threat: null, prey: null, food: null, ally: null, allyCount: 0, allyCentroid: null, threatCount: 0, memorySource: this.memorySource };
    }
    update(seeker, state, visibleWorld) {
        const grid = state.obstacleGrid;
        const session = state.sandbox?.snakeGame;
        const ally = this.filterAllyForEngagement ? allyIfEngaged(session, visibleWorld.ally) : visibleWorld.ally;
        this.memory.observe("threat", visibleWorld.threat, seeker, grid);
        this.memory.observe("prey", visibleWorld.prey, seeker, grid);
        this.memory.observe("food", visibleWorld.food, seeker, grid);
        this.memory.observe("ally", ally, seeker, grid);
    }
    enrichWorld(state, visibleWorld) {
        const session = state.sandbox?.snakeGame;
        const threat = mergeTarget(visibleWorld, "threat", this.memory.record("threat"), state);
        const prey = mergeTarget(visibleWorld, "prey", this.memory.record("prey"), state);
        const food = mergeTarget(visibleWorld, "food", this.memory.record("food"), state);
        const ally = mergeAlly(visibleWorld, this.memory.record("ally"), state, session, this.filterAllyForEngagement);
        this.world.threat = threat;
        this.world.prey = prey;
        this.world.food = food;
        this.world.ally = ally;
        this.world.threatCount = visibleWorld.threatCount ?? 0;
        this.world.allyCount = visibleWorld.ally ? (visibleWorld.allyCount ?? 1) : ally ? 1 : 0;
        this.world.allyCentroid = visibleWorld.ally ? (visibleWorld.allyCentroid ?? null) : null;
        this.memorySource.threat = !visibleWorld.threat && !!threat;
        this.memorySource.prey = !visibleWorld.prey && !!prey;
        this.memorySource.food = !visibleWorld.food && !!food;
        this.memorySource.ally = !visibleWorld.ally && !!ally;
        return this.world;
    }
    getWorld() {
        return this.world;
    }
    snapshot() {
        return this.memory.snapshot();
    }
    clear() {
        this.memory.clear();
        this.world.threat = null;
        this.world.prey = null;
        this.world.food = null;
        this.world.ally = null;
        this.world.allyCount = 0;
        this.world.allyCentroid = null;
        this.world.threatCount = 0;
        this.memorySource.threat = false;
        this.memorySource.prey = false;
        this.memorySource.food = false;
        this.memorySource.ally = false;
    }
    clearTarget(id) {
        this.memory.clearTarget(id);
    }
}
export function createAgentIntentMemory(config) {
    return new AgentIntentMemory(config);
}
