export function routeEventsInto(out, routeStatus) {
    out.length = 0;
    if (!routeStatus) return out;
    if (routeStatus.routeFailed) out.push("ROUTE_FAILED");
    if (routeStatus.destReached) out.push("DEST_REACHED");
    return out;
}
export function pushTargetEvents(events, kind, visibleTarget, rememberedTarget) {
    const upper = kind.toUpperCase();
    if (visibleTarget) {
        events.push(`${upper}_SEEN`);
        return;
    }
    if (rememberedTarget) events.push(kind === "prey" ? "PREY_LAST_SEEN_ACTIVE" : `${upper}_REMEMBERED`);
}
export function routeEvents(routeStatus) {
    return routeEventsInto([], routeStatus);
}
export function policyReasonForTarget(ctx, kind) {
    if (ctx.remembered[kind]) return `${kind}_memory`;
    return null;
}
export function intentPolicy(mode, targetId, reason = null) {
    const policy = { mode, targetId };
    if (reason) policy.reason = reason;
    return policy;
}
