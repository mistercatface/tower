export function worldSimFromState(state) {
    return { worldProps: state.worldProps, projectiles: state.projectiles, entityRegistry: state.entityRegistry, kinetic: state.kinetic, sandbox: state.sandbox };
}
