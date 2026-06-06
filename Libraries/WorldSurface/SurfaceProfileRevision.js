/** Runtime profile revision counters — bumped when TileLab/game registers edited profiles. */
const revisions = new Map();
export function getSurfaceProfileRevision(profileId) {
    return revisions.get(profileId) ?? 0;
}
/** @returns {number} New revision after bump. */
export function bumpSurfaceProfileRevision(profileId) {
    const rev = (revisions.get(profileId) ?? 0) + 1;
    revisions.set(profileId, rev);
    return rev;
}
