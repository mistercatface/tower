/**
 * Penner easing equations for standard easing effects.
 * Each function maps a normalized time (0 to 1) to a normalized progress value (0 to 1).
 */

export const EASING_FUNCTIONS = {
    linear: (t) => t,
    
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => t * (2 - t),
    easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => {
        const t1 = t - 1;
        return t1 * t1 * t1 + 1;
    },
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
    
    easeInQuart: (t) => t * t * t * t,
    easeOutQuart: (t) => {
        const t1 = t - 1;
        return 1 - t1 * t1 * t1 * t1;
    },
    easeInOutQuart: (t) => {
        if (t < 0.5) return 8 * t * t * t * t;
        const t1 = t - 1;
        return 1 - 8 * t1 * t1 * t1 * t1;
    },
    
    easeInQuint: (t) => t * t * t * t * t,
    easeOutQuint: (t) => {
        const t1 = t - 1;
        return 1 + t1 * t1 * t1 * t1 * t1;
    },
    easeInOutQuint: (t) => {
        if (t < 0.5) return 16 * t * t * t * t * t;
        const t1 = t - 1;
        return 1 + 16 * t1 * t1 * t1 * t1 * t1;
    },
    
    easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    
    easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
    easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    easeInOutExpo: (t) => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
        return (2 - Math.pow(2, -20 * t + 10)) / 2;
    },
    
    easeInCirc: (t) => 1 - Math.sqrt(1 - t * t),
    easeOutCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
    easeInOutCirc: (t) => (t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2),
};

export const EASING_OPTIONS = Object.keys(EASING_FUNCTIONS);

/** Perlin smootherstep — C² continuous ease on [0, 1]. */
export function smootherstep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Applies a selected easing function by name to a normalized time t.
 * Falls back to linear if the function is not found.
 */
export function applyEasing(type, t) {
    const fn = EASING_FUNCTIONS[type] || EASING_FUNCTIONS.linear;
    return fn(t);
}

/**
 * Easing to use after reversing a stage (start/end swapped).
 * easeIn* ↔ easeOut* preserves perceived acceleration; linear and easeInOut* stay
 * (symmetric or directionless).
 */
export function mirrorEasingForReversedStage(type) {
    const easing = type ?? "linear";
    if (easing === "linear" || easing.includes("InOut")) {
        return easing;
    }

    const inMatch = /^easeIn(\w+)$/.exec(easing);
    if (inMatch) {
        const mirrored = `easeOut${inMatch[1]}`;
        return mirrored in EASING_FUNCTIONS ? mirrored : easing;
    }

    const outMatch = /^easeOut(\w+)$/.exec(easing);
    if (outMatch) {
        const mirrored = `easeIn${outMatch[1]}`;
        return mirrored in EASING_FUNCTIONS ? mirrored : easing;
    }

    return easing;
}
