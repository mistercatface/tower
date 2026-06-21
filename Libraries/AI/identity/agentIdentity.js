const identities = new Map();
const NAMES = [
    "Slither",
    "Viper",
    "Noodles",
    "Kaa",
    "Monty",
    "Cobra",
    "Anaconda",
    "Fang",
    "Venom",
    "Coiler",
    "Slinky",
    "Snape",
    "Basilisk",
    "Jafar",
    "Nag",
    "Solid",
    "Liquid",
    "Spaghetti",
    "Boa",
    "Slink",
    "Wiggles",
    "Sneeky",
    "Wormy",
    "Danger Noodle",
    "Nope Rope",
    "Slippy",
    "Severus",
    "Strider",
    "Garter",
    "Adder",
    "Mamba",
    "Copperhead",
    "Rattler",
    "Sidewinder",
];
/**
 * Assigns an identity object like { name, color } by entity id or agent id.
 * @param {string|number} id
 * @param {{ name: string, color: string }} identity
 */
export function setAgentIdentity(id, identity) {
    identities.set(id, identity);
}
/**
 * Reads an identity object by entity id or agent id.
 * @param {string|number} id
 * @returns {{ name: string, color: string } | null}
 */
export function getAgentIdentity(id) {
    return identities.get(id) || null;
}
/**
 * Removes an identity object by entity id or agent id.
 * @param {string|number} id
 */
export function deleteAgentIdentity(id) {
    identities.delete(id);
}
/**
 * Clears all agent identities.
 */
export function clearAllAgentIdentities() {
    identities.clear();
}
/**
 * Resolves a friendly name for an agent.
 * @param {string|number} id
 * @param {string} fallback
 * @returns {string}
 */
export function resolveAgentName(id, fallback = "Agent") {
    const identity = getAgentIdentity(id);
    return identity ? identity.name : fallback;
}
/**
 * Picks a random name from the pre-defined snake name list.
 * @param {() => number} [rng]
 * @returns {string}
 */
export function pickRandomName(rng = Math.random) {
    const index = Math.floor(rng() * NAMES.length);
    return NAMES[index];
}
