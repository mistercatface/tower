import { CUE_STICK_DEFAULTS } from "../../../Libraries/CueStick/cueStickDefaults.js";
/** Pool table cue — long shaft tuned for ~700×384 world table. */
export const POOL_CUE_STICK_TUNING = {
    ...CUE_STICK_DEFAULTS,
    hx: 78,
    maxPull: 75,
    /** Min finger offset from press point required to shoot on release. */
    minPullDrag: 3,
    quantizeSteps: { facing: 256, roll: 256 },
};
