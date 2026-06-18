import { SANDBOX_DEFAULT_FACTION, SANDBOX_FACTION_OPTIONS } from "../../Sandbox/sandboxFaction.js";
import { getSandboxBehaviorLabel } from "../../Sandbox/sandboxCapabilities.js";
import { appendSelectField } from "../../UI/paramFields.js";
export function appendFactionSelect(parent, { value, onChange }) {
    appendSelectField(parent, "Team", { value: value ?? SANDBOX_DEFAULT_FACTION, options: SANDBOX_FACTION_OPTIONS.map((option) => ({ value: option.id, label: option.label })), onChange });
}
export function appendBehaviorModeField(parent, behaviorIds, value, onChange) {
    if (behaviorIds.length === 0) return;
    appendSelectField(parent, "Mode", { value, options: behaviorIds.map((behaviorId) => ({ value: behaviorId, label: getSandboxBehaviorLabel(behaviorId) })), onChange });
}
