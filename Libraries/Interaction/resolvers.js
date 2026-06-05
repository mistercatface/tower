/**
 * Default entity field resolvers for pair interaction rules.
 * Uses direct properties; game presets may extend via PairFilterConfig.resolvers.
 */

/** @param {object} entity */
export function directFaction(entity) {
    return entity.faction;
}

export const standardResolvers = {
    faction: directFaction,
};
