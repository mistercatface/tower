/**
 * @typedef {object} FactionResolver
 * @property {(entity: object) => string | undefined} resolveFaction
 * @property {(a: object, b: object) => boolean} areHostile
 */
/**
 * @param {{
 *   resolveFaction: (entity: object) => string | undefined,
 *   hostilePairs?: [string, string][],
 * }} config
 * @returns {FactionResolver}
 */
export function createFactionResolver({ resolveFaction, hostilePairs = [] }) {
    function pairsHostile(fa, fb) {
        for (let i = 0; i < hostilePairs.length; i++) {
            const [a, b] = hostilePairs[i];
            if ((fa === a && fb === b) || (fa === b && fb === a)) return true;
        }
        return false;
    }
    function areHostile(a, b) {
        if (!a || !b || a === b || a.isDead || b.isDead) return false;
        if (a.isPassive || b.isPassive) return false;
        if (a.teamId != null && b.teamId != null && a.teamId === b.teamId) return false;
        const fa = resolveFaction(a);
        const fb = resolveFaction(b);
        if (fa == null || fb == null || fa === fb) return false;
        return pairsHostile(fa, fb);
    }
    return { resolveFaction, areHostile };
}
