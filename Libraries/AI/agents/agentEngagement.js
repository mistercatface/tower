export function publishAgentEngagement(session, headId, engagementState) {
    if (!session || headId == null) return;
    if (!session.engagementByHeadId) session.engagementByHeadId = new Map();
    session.engagementByHeadId.set(headId, engagementState);
}
export function readAgentEngagement(session, headId) {
    return session?.engagementByHeadId?.get(headId) ?? null;
}
export function isAgentEngaged(session, headId) {
    return readAgentEngagement(session, headId)?.active === true;
}
