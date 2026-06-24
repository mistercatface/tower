export const sandboxFactions = { alpha: "alpha", bravo: "bravo", charlie: "charlie", delta: "delta", echo: "echo" };
export const SANDBOX_DEFAULT_FACTION = sandboxFactions.alpha;
export const SANDBOX_FACTION_OPTIONS = [
    { id: sandboxFactions.alpha, label: "Alpha" },
    { id: sandboxFactions.bravo, label: "Bravo" },
    { id: sandboxFactions.charlie, label: "Charlie" },
    { id: sandboxFactions.delta, label: "Delta" },
    { id: sandboxFactions.echo, label: "Echo" },
];
export function formatSandboxFactionLabel(factionId) {
    return SANDBOX_FACTION_OPTIONS.find((opt) => opt.id === factionId)?.label ?? factionId;
}
export function resolveSandboxFaction(actor) {
    return actor?.faction ?? SANDBOX_DEFAULT_FACTION;
}
