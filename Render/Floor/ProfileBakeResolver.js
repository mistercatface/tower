/**
 * Resolves a static floor profile + binding sources into one scratch profile for baking.
 *
 * Binding sources (timeline, anchors, triggers, overrides) write motif params; the
 * procedural stack runs once against the merged result.
 */

/** @typedef {{ frameIndex?: number, gameTime?: number, player?: { x: number, y: number }, bindings?: Binding[] }} BakeContext */

/** @typedef {{ id: string, refs: ParamRef[], apply: (scratch: object, ctx: BakeContext) => void }} Binding */

/** @typedef {{ path: string, get: (root: object) => unknown, set: (root: object, value: unknown) => void }} ParamRef */

const scratchEntries = new Map();

function parseTargetPath(path) {
    return path
        .replace(/\]/g, "")
        .split(/[\[\.]+/)
        .filter(Boolean);
}

/** @returns {ParamRef} */
export function compileParamRef(path) {
    const parts = parseTargetPath(path);
    return {
        path,
        get(root) {
            let curr = root;
            for (const part of parts) {
                curr = curr[part];
            }
            return curr;
        },
        set(root, value) {
            let curr = root;
            for (let i = 0; i < parts.length - 1; i++) {
                curr = curr[parts[i]];
            }
            curr[parts[parts.length - 1]] = value;
        },
    };
}

function cloneProfile(profile) {
    if (typeof structuredClone === "function") {
        return structuredClone(profile);
    }
    return JSON.parse(JSON.stringify(profile));
}

function getScratchEntry(profileKey, baseProfile) {
    let entry = scratchEntries.get(profileKey);
    if (!entry || entry.base !== baseProfile) {
        entry = {
            base: baseProfile,
            scratch: cloneProfile(baseProfile),
            boundRefs: new Set(),
        };
        scratchEntries.set(profileKey, entry);
    }
    return entry;
}

function resetBoundParams(entry) {
    for (const ref of entry.boundRefs) {
        ref.set(entry.scratch, ref.get(entry.base));
    }
}

function trackRefs(entry, bindings) {
    for (const binding of bindings) {
        for (const ref of binding.refs) {
            entry.boundRefs.add(ref);
        }
    }
}

function timelinePhase(profile, ctx) {
    const anim = profile.animation;
    const frames = anim.frames;
    if (ctx.frameIndex != null) {
        const idx = Math.min(frames - 1, Math.max(0, ctx.frameIndex));
        return frames > 1 ? idx / (frames - 1) : 0;
    }
    if (ctx.gameTime != null) {
        const duration = anim.durationMs ?? 1000;
        const clock = ((ctx.gameTime % duration) + duration) % duration;
        return clock / duration;
    }
    return 0;
}

/**
 * Timeline tracks from profile.animation (same data Tile Lab edits today).
 * @returns {Binding | null}
 */
export function createTimelineBinding(profile) {
    const anim = profile?.animation;
    if (!anim) {
        return null;
    }

    const rawTracks = anim.tracks || [{ targetPath: anim.targetPath, startValue: anim.startValue, endValue: anim.endValue }];
    const tracks = rawTracks
        .filter((track) => track?.targetPath)
        .map((track) => ({
            ref: compileParamRef(track.targetPath),
            startValue: track.startValue ?? 0,
            endValue: track.endValue ?? 0,
        }));

    if (tracks.length === 0) {
        return null;
    }

    return {
        id: "timeline",
        refs: tracks.map((track) => track.ref),
        apply(scratch, ctx) {
            const t = timelinePhase(profile, ctx);
            for (const track of tracks) {
                const value = track.startValue + (track.endValue - track.startValue) * t;
                track.ref.set(scratch, value);
            }
        },
    };
}

/**
 * Explicit param writes, e.g. from triggers or gameplay systems.
 * @param {{ path: string, value: unknown }[]} overrides
 * @returns {Binding}
 */
export function createParamOverrideBinding(overrides) {
    const entries = overrides.map((override) => ({
        ref: compileParamRef(override.path),
        value: override.value,
    }));

    return {
        id: "paramOverride",
        refs: entries.map((entry) => entry.ref),
        apply(scratch) {
            for (const entry of entries) {
                entry.ref.set(scratch, entry.value);
            }
        },
    };
}

/**
 * Bind a world-space point to a motif param (e.g. concentricRings offset).
 * @param {string} targetPath
 * @param {(ctx: BakeContext) => { x: number, y: number } | [number, number] | null | undefined} getPoint
 * @returns {Binding}
 */
export function createWorldPointBinding(targetPath, getPoint) {
    const ref = compileParamRef(targetPath);
    return {
        id: `worldPoint:${targetPath}`,
        refs: [ref],
        apply(scratch, ctx) {
            const point = getPoint(ctx);
            if (point == null) {
                return;
            }
            if (Array.isArray(point)) {
                ref.set(scratch, point);
                return;
            }
            ref.set(scratch, [point.x, point.y]);
        },
    };
}

/** Collect default bindings for a bake (timeline + any extras on the context). */
export function buildBakeBindings(baseProfile, ctx) {
    const bindings = [];
    const timeline = createTimelineBinding(baseProfile);
    if (timeline) {
        bindings.push(timeline);
    }
    if (ctx.bindings?.length) {
        bindings.push(...ctx.bindings);
    }
    return bindings;
}

/**
 * Merge binding sources into a reusable scratch profile for one bake.
 * @param {object} baseProfile — static authored profile (not mutated)
 * @param {string} profileKey — cache key, usually profileId
 * @param {BakeContext} ctx
 * @returns {object} scratch profile ready for paintPixelArea / composeFloorImage
 */
export function resolveBakeProfile(baseProfile, profileKey, ctx = {}) {
    const entry = getScratchEntry(profileKey, baseProfile);
    const bindings = buildBakeBindings(baseProfile, ctx);

    trackRefs(entry, bindings);
    resetBoundParams(entry);

    for (const binding of bindings) {
        binding.apply(entry.scratch, ctx);
    }

    return entry.scratch;
}

/** Drop cached scratch when a runtime profile is replaced (lab edit, worker sync). */
export function invalidateProfileScratch(profileKey) {
    scratchEntries.delete(profileKey);
}

export function clearProfileScratchCache() {
    scratchEntries.clear();
}
