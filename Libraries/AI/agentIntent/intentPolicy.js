export function policyReasonForTarget(blackboard, kind) {
    if (blackboard.facts.remembered[kind]) return `${kind}_memory`;
    return null;
}
export function intentPolicy(mode, targetId, reason = null) {
    const policy = { mode, targetId };
    if (reason) policy.reason = reason;
    return policy;
}
