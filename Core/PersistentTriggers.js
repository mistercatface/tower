import { PersistentTriggers } from "../Libraries/Triggers/index.js";
export const persistentTriggers = new PersistentTriggers();
export function loadPersistentTriggers() {
    persistentTriggers.load();
}
export function clearPersistentTriggers() {
    persistentTriggers.clear();
}
