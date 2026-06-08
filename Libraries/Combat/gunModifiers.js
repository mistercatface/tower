/** Merge equipModifiers and enabled attachment modifiers on a resolved gun instance. */
export function getActiveEquipModifiers(gun) {
    const mods = { ...(gun.equipModifiers ?? {}) };
    if (gun.attachments)
        for (const attachment of Object.values(gun.attachments))
            if (attachment.enabled && attachment.modifiers)
                for (const [key, val] of Object.entries(attachment.modifiers))
                    if (key.endsWith("Multiplier")) mods[key] = (mods[key] ?? 1) * val;
                    else if (key.endsWith("Bonus")) mods[key] = (mods[key] ?? 0) + val;
    return mods;
}
/** @returns {object | null} First enabled sight attachment on a gun instance. */
export function getActiveSightAttachment(gun) {
    if (!gun?.attachments) return null;
    for (const attachment of Object.values(gun.attachments)) if (attachment.enabled && attachment.isSight) return attachment;
    return null;
}
