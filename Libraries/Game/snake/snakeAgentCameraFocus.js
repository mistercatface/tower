import { aliveAgentInstances } from "../../AI/agents/agentPopulationRegistry.js";
import { setSandboxCameraTarget } from "../../Sandbox/sandboxCameraTarget.js";
function isFocusableInstance(instance) {
    return instance?.lifecycle === "alive" && instance.head && !instance.head.isDead;
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
    function getFocusedInstance() {
        return isFocusableInstance(session.focusedInstance) ? session.focusedInstance : null;
    }
    function cycle() {
        const instances = getFocusableInstances();
        if (instances.length === 0) {
            setFocusedInstance(null);
            return null;
        }
        const current = getFocusedInstance();
        const currentIndex = current ? instances.indexOf(current) : -1;
        setFocusedInstance(instances[(currentIndex + 1) % instances.length]);
        return getFocusedInstance();
    }
    function clear() {
        setFocusedInstance(null);
    }
    function onAgentDied(instance) {
        if (session.focusedInstance === instance) setFocusedInstance(null);
    }
    function handleKeyDown(e) {
        if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.matches("textarea, select, input"))) return;
        if (e.code === triggerKey) {
            e.preventDefault();
            cycle();
        }
    }
    return {
        setFocusedInstance,
        getFocusedInstance,
        cycle,
        clear,
        onAgentDied,
        bindInput() {
            window.addEventListener("keydown", handleKeyDown);
        },
        destroy() {
            window.removeEventListener("keydown", handleKeyDown);
            setFocusedInstance(null);
        },
    };
}
