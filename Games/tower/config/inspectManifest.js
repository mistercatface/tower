/**
 * Single source of truth for inspectable clue objects in the opening tutorial.
 * Run scenes, prop inspectKey wiring, and inspect UI registration all read this.
 *
 * Guided inspect radios resolve from radio triggers `inspect:{id}` when omitted in scene config.
 */
/** @typedef {object} InspectManifestEntry
 * @property {string} id — inspectKey used on pickups and in run scenes
 * @property {string} propType — key in worldPropDefinitions (barrel, crate, …)
 * @property {string} title — inspect panel heading
 * @property {number} [tapPadding]
 */
/** @type {InspectManifestEntry[]} */
export const inspectManifest = [
    { id: "fuel_barrel", propType: "barrel", title: "VOLATILE FLUID", tapPadding: 14 },
    { id: "wood_crate", propType: "crate", title: "SHIPPING CRATE", tapPadding: 14 },
];
/** @type {string[]} */
export const clueSearchInspectKeys = inspectManifest.map((entry) => entry.id);
/** Radio trigger ids for skip/mark-seen (e.g. inspect:fuel_barrel). */
export const clueSearchInspectRadioTriggers = inspectManifest.map((entry) => `inspect:${entry.id}`);
/** @type {Record<string, string>} propType → inspectKey */
export const inspectManifestByPropType = Object.fromEntries(inspectManifest.map((entry) => [entry.propType, entry.id]));
/** Wire manifest inspect keys onto world prop definitions at game boot. */
export function applyInspectManifestToProps(worldPropDefinitions) {
    for (const entry of inspectManifest) {
        const prop = worldPropDefinitions[entry.propType];
        if (prop) prop.inspectKey = entry.id;
    }
}
