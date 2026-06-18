export function extendPropAlias(base, { id, sandbox, physics, defaultVisualOverride }) {
    return { ...base, id, sandbox: sandbox ? { ...base.sandbox, ...sandbox } : base.sandbox, physics: physics ? { ...base.physics, ...physics } : base.physics, defaultVisualOverride };
}
