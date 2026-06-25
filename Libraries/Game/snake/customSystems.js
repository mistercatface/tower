import { tickGunBullets } from "./gunAgent/gunBulletLifecycle.js";
import { resolveGunBulletContacts } from "./gunAgent/gunBulletContacts.js";

export const CUSTOM_SYSTEMS = [
    {
        tick(state, dtMs) {
            tickGunBullets(state, dtMs);
        },
        resolveContacts(state, frame, contacts) {
            resolveGunBulletContacts(state, frame, contacts);
        }
    }
];
