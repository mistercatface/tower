/**
 * @typedef {object} KeyBinding
 * @property {string} key — matched case-insensitively (KeyboardEvent.key)
 * @property {(event: KeyboardEvent) => void} onPress
 */
/**
 * @param {Window | Document | HTMLElement} target
 * @param {KeyBinding[]} bindings
 * @returns {() => void}
 */
export function bindKeyDown(target, bindings) {
    const handler = (e) => {
        const pressed = e.key.toLowerCase();
        for (let i = 0; i < bindings.length; i++) {
            const binding = bindings[i];
            if (pressed === binding.key.toLowerCase()) {
                binding.onPress(e);
                return;
            }
        }
    };
    target.addEventListener("keydown", handler);
    return () => target.removeEventListener("keydown", handler);
}
