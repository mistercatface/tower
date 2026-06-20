export function worldSimFromState(state) {
    return { worldProps: state.worldProps, entityRegistry: state.entityRegistry, kinetic: state.kinetic, sandbox: state.sandbox, hpaPathSession: state.hpaPathSession };
}
