function pushTargetEvents(events, kind, visibleTarget, rememberedTarget) {
    const upper = kind.toUpperCase();
    if (visibleTarget) {
        events.push(`${upper}_SEEN`);
        return;
    }
    if (rememberedTarget) events.push(kind === "prey" ? "PREY_LAST_SEEN_ACTIVE" : `${upper}_REMEMBERED`);
}
function routeEvents(routeStatus) {
    const events = [];
    if (!routeStatus) return events;
    if (routeStatus.routeFailed) events.push("ROUTE_FAILED");
    if (routeStatus.destReached) events.push("DEST_REACHED");
    return events;
}
export function createSnakeDecisionBlackboard({
    visibleWorld,
    memoryWorld = null,
    memorySource = null,
    committedTarget = null,
    routeStatus = null,
    hungerState = null,
    safetyState = null,
    recentFailures = [],
}) {
    const remembered = {
        threat: memorySource?.threat ? (memoryWorld?.threat ?? null) : null,
        prey: memorySource?.prey ? (memoryWorld?.prey ?? null) : null,
        food: memorySource?.food ? (memoryWorld?.food ?? null) : null,
    };
    const known = { threat: visibleWorld.threat ?? remembered.threat, prey: visibleWorld.prey ?? remembered.prey, food: visibleWorld.food ?? remembered.food };
    const events = routeEvents(routeStatus);
    pushTargetEvents(events, "threat", visibleWorld.threat, remembered.threat);
    pushTargetEvents(events, "prey", visibleWorld.prey, remembered.prey);
    pushTargetEvents(events, "food", visibleWorld.food, remembered.food);
    if (!known.prey && committedTarget?.mode === "seek_prey") events.push("TARGET_LOST");
    if (!known.food && committedTarget?.mode === "seek_food") events.push("TARGET_LOST");
    return {
        facts: {
            visible: { threat: visibleWorld.threat, prey: visibleWorld.prey, food: visibleWorld.food },
            remembered,
            known,
            committedTarget,
            routeStatus,
            hungerState,
            safetyState,
            recentFailures,
        },
        events,
    };
}
export function buildSnakeDecisionContext({
    visibleWorld,
    memoryWorld = null,
    memorySource = null,
    committedTarget = null,
    routeStatus = null,
    hungerState = null,
    safetyState = null,
    recentFailures = [],
    pickPolicy,
}) {
    const blackboard = createSnakeDecisionBlackboard({ visibleWorld, memoryWorld, memorySource, committedTarget, routeStatus, hungerState, safetyState, recentFailures });
    const chosenIntent = pickPolicy(blackboard);
    const decisionSnapshot = {
        events: blackboard.events,
        hungerState,
        routeStatus,
        committedTarget,
        candidateScores: null,
        chosenIntent,
        chosenReason: chosenIntent.reason ?? null,
        targetId: chosenIntent.targetId ?? null,
    };
    return { blackboard, decisionSnapshot };
}
