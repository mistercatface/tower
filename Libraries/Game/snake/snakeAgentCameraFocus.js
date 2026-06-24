import { aliveAgentInstances } from "../../AI/agents/agentPopulationRegistry.js";
import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
function isFocusableInstance(instance) {
    return instance?.lifecycle === "alive" && instance.head && !instance.head.isDead;
}
export function getSessionFocusedInstance(session) {
    return isFocusableInstance(session?.focusedInstance) ? session.focusedInstance : null;
}
export function createSnakeAgentCameraFocus(state, session, { onTargetChanged = null, triggerKey = "Tab" } = {}) {
    function getFocusableInstances() {
        const instances = [];
        for (const instance of aliveAgentInstances(session.registry)) if (isFocusableInstance(instance)) instances.push(instance);
        return instances;
    }
    function setFocusedInstance(instance) {
        const next = isFocusableInstance(instance) ? instance : null;
        if (session.focusedInstance === next) return;
        const prevHead = session.focusedInstance?.head;
        const nextHead = next?.head;
        if (prevHead) setSandboxCameraTarget(state, prevHead, false);
        session.focusedInstance = next;
        if (nextHead) {
            setSandboxCameraTarget(state, nextHead, true);
            state.viewport.snapTo(nextHead.x, nextHead.y);
        }
        onTargetChanged?.(next);
    }
    function cycleCameraFocus() {
        const instances = getFocusableInstances();
        if (instances.length === 0) {
            setFocusedInstance(null);
            return null;
        }
        const current = getSessionFocusedInstance(session);
        const currentIndex = current ? instances.indexOf(current) : -1;
        setFocusedInstance(instances[(currentIndex + 1) % instances.length]);
        return getSessionFocusedInstance(session);
    }
    function clearCameraFocus() {
        setFocusedInstance(null);
    }
    function handleKeyDown(e) {
        if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.matches("textarea, select, input"))) return;
        if (e.code === triggerKey) {
            e.preventDefault();
            cycleCameraFocus();
        }
    }
    session.setFocusedInstance = setFocusedInstance;
    session.cycleCameraFocus = cycleCameraFocus;
    session.clearCameraFocus = clearCameraFocus;
    session.bindCameraFocusInput = () => {
        window.addEventListener("keydown", handleKeyDown);
    };
    session.destroyCameraFocus = () => {
        window.removeEventListener("keydown", handleKeyDown);
        setFocusedInstance(null);
    };
}
