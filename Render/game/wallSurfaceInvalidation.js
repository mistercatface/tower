/** Game-side wall atlas cache invalidation (edge memo fields on live wall segments). */
export function invalidateWallAtlasKeyMemos(state) {
    for (const seg of state.walls) {
        const edges = seg._cachedEdges;
        if (!edges) continue;
        for (const edge of edges) {
            delete edge._wkInfo;
            delete edge._wkProfileId;
            delete edge._wkPpwu;
            delete edge._wkRev;
            delete edge._wkSeed;
            delete edge._wkWallHeight;
            delete edge._wallAtlasStash;
        }
    }
}
