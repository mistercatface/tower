/**
 * Generic named-state machine: Map of states, shared context, enter/exit/update hooks.
 */
export class StateMachine {
    /** @param {object} context */
    constructor(context) {
        this.states = new Map();
        this.currentState = null;
        this.currentStateName = null;
        this.context = context;
    }
    addState(name, stateInstance) {
        this.states.set(name, stateInstance);
    }
    transition(name) {
        if (this.currentState?.onExit) this.currentState.onExit(this.context);
        this.currentState = this.states.get(name);
        this.currentStateName = name;
        if (this.currentState?.onEnter) this.currentState.onEnter(this.context);
    }
    update(dt) {
        if (this.currentState?.update) this.currentState.update(dt, this.context);
    }
    render() {
        if (this.currentState?.render) this.currentState.render(this.context);
    }
    handleInteraction(worldCoords, isDoubleTap) {
        if (this.currentState?.handleInteraction) this.currentState.handleInteraction(worldCoords, isDoubleTap, this.context);
    }
}
