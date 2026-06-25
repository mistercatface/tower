import { tickGunBullets, resolveGunBulletContacts } from "./gunAgent/gunBulletSystem.js";
export const CUSTOM_SYSTEMS = [
    {
        tick(state, dtMs) {
            tickGunBullets(state, dtMs);
        },
        resolveContacts(state, frame, contacts) {
            resolveGunBulletContacts(state, frame, contacts);
        },
    },
];
