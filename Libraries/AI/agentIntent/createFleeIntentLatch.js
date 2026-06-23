import { createModePolicyLatch } from "./policyHysteresis.js";
function readThreatState(world) {
    return world.blackboard?.facts?.threatState ?? world.decisionSnapshot?.threatState;
}
export function createFleeIntentLatch(config) {
    const fleeHysteresis = config.fleeHysteresis;
    return createModePolicyLatch({
        mode: "flee",
        minTicks: fleeHysteresis.minTicks,
        holdReason: "flee_hysteresis",
        refreshWhen: ({ world }) => {
            const threat = readThreatState(world);
            return threat?.lethal || threat?.severity >= fleeHysteresis.refreshAtSeverity;
        },
        canRelease: ({ world }) => {
            const threat = readThreatState(world);
            return !threat || (!threat.lethal && threat.severity <= fleeHysteresis.exitThreatSeverity);
        },
    });
}
export function applyFleePolicyLatch({ world, fleeLatch, currentMode, deriveSprintIntent, fleeHeldOn = "flee" }) {
    const chosen = world.decisionSnapshot.chosenIntent;
    const policy = fleeLatch.apply(chosen, { world, currentMode });
    if (policy !== chosen) {
        if (fleeHeldOn === "any" || policy.mode === "flee") world.blackboard.events.push("FLEE_HELD");
        world.decisionSnapshot.events = world.blackboard.events;
        world.decisionSnapshot.chosenIntent = policy;
        world.decisionSnapshot.chosenReason = policy.reason ?? null;
        world.decisionSnapshot.targetId = policy.targetId ?? null;
        world.decisionSnapshot.sprintIntent = deriveSprintIntent(policy.mode, world.decisionSnapshot);
    }
    world.decisionSnapshot.policyLatch = { flee: fleeLatch.snapshot() };
    return policy;
}
