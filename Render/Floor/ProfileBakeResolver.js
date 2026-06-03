/**
 * Resolves a static floor profile + binding sources into one scratch profile for baking.
 *
 * Binding sources (timeline, anchors, triggers, overrides) write motif params; the
 * procedural stack runs once against the merged result.
 */

/** @typedef {{ frameIndex?: number, gameTime?: number, player?: { x: number, y: number }, bindings?: Binding[] }} BakeContext */

/** @typedef {{ id: string, refs: ParamRef[], apply: (scratch: object, ctx: BakeContext) => void }} Binding */

/** @typedef {{ path: string, get: (root: object) => unknown, set: (root: object, value: unknown) => void }} ParamRef */

import { applyEasing } from "../../Math/Easing.js";

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

export function getAnimationStages(anim) {
    return anim?.stages || [];
}

export function getAnimationFrames(anim) {
    if (!anim) return 1;
    const stages = getAnimationStages(anim);
    return stages.reduce((sum, s) => sum + (s.frames ?? 30), 0) || 1;
}

export function getAnimationDuration(anim) {
    if (!anim) return 1000;
    const stages = getAnimationStages(anim);
    return stages.reduce((sum, s) => sum + (s.durationMs ?? 1000), 0) || 1000;
}

export function animationFrameIndex(anim, ctx) {
    if (!anim) return 0;
    const stages = getAnimationStages(anim);
    if (stages.length === 0) return 0;

    if (ctx?.frameIndex != null) {
        const totalFrames = getAnimationFrames(anim);
        return Math.min(totalFrames - 1, Math.max(0, ctx.frameIndex));
    }

    const gameTime = ctx?.gameTime ?? 0;
    const totalDuration = getAnimationDuration(anim);
    const clock = ((gameTime % totalDuration) + totalDuration) % totalDuration;

    let elapsedMs = 0;
    let elapsedFrames = 0;
    for (const stage of stages) {
        const stageDuration = stage.durationMs ?? 1000;
        const stageFrames = stage.frames ?? 30;
        if (clock >= elapsedMs && clock < elapsedMs + stageDuration) {
            const localProgress = (clock - elapsedMs) / stageDuration;
            const localFrame = Math.floor(localProgress * stageFrames);
            return elapsedFrames + Math.min(stageFrames - 1, Math.max(0, localFrame));
        }
        elapsedMs += stageDuration;
        elapsedFrames += stageFrames;
    }
    const totalFrames = getAnimationFrames(anim);
    return Math.max(0, totalFrames - 1);
}

export function getActiveStageInfo(anim, ctx) {
    const stages = getAnimationStages(anim);
    if (stages.length === 0) return null;

    const frameIndex = animationFrameIndex(anim, ctx);

    let elapsedFrames = 0;
    for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        const stageFrames = stage.frames ?? 30;
        if (frameIndex >= elapsedFrames && frameIndex < elapsedFrames + stageFrames) {
            const localT = stageFrames > 1 ? (frameIndex - elapsedFrames) / (stageFrames - 1) : 0;
            return { stageIndex: i, stage, t: localT };
        }
        elapsedFrames += stageFrames;
    }
    const lastIdx = stages.length - 1;
    return { stageIndex: lastIdx, stage: stages[lastIdx], t: 1 };
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

    const stages = getAnimationStages(anim);
    if (stages.length === 0) {
        return null;
    }

    const allTargetPaths = new Set();
    for (const stage of stages) {
        if (stage.tracks) {
            for (const track of stage.tracks) {
                if (track?.targetPath) {
                    allTargetPaths.add(track.targetPath);
                }
            }
        }
    }

    const compiledTracks = Array.from(allTargetPaths).map((targetPath) => ({
        targetPath,
        ref: compileParamRef(targetPath),
    }));

    if (compiledTracks.length === 0) {
        return null;
    }

    return {
        id: "timeline",
        refs: compiledTracks.map((t) => t.ref),
        apply(scratch, ctx) {
            const activeInfo = getActiveStageInfo(anim, ctx);
            if (!activeInfo) return;

            const { stageIndex, t } = activeInfo;

            for (const compiled of compiledTracks) {
                const targetPath = compiled.targetPath;
                let value = null;
                let found = false;

                const activeStage = stages[stageIndex];
                const activeTrack = activeStage.tracks?.find((tr) => tr.targetPath === targetPath);
                if (activeTrack) {
                    const start = activeTrack.startValue ?? 0;
                    const end = activeTrack.endValue ?? 0;
                    const easingType = activeTrack.easing ?? "linear";
                    const easedT = applyEasing(easingType, t);
                    value = start + (end - start) * easedT;
                    found = true;
                }

                if (!found) {
                    for (let i = stageIndex - 1; i >= 0; i--) {
                        const tr = stages[i].tracks?.find((tr) => tr.targetPath === targetPath);
                        if (tr) {
                            value = tr.endValue ?? 0;
                            found = true;
                            break;
                        }
                    }
                }

                if (!found) {
                    for (let i = stageIndex + 1; i < stages.length; i++) {
                        const tr = stages[i].tracks?.find((tr) => tr.targetPath === targetPath);
                        if (tr) {
                            value = tr.startValue ?? 0;
                            found = true;
                            break;
                        }
                    }
                }

                if (found) {
                    compiled.ref.set(scratch, value);
                }
            }
        },
    };
}

/** Collect default bindings for a bake (runtime sources first, timeline last so tracks win). */
export function buildBakeBindings(baseProfile, ctx) {
    const bindings = [];
    if (ctx.bindings?.length) {
        bindings.push(...ctx.bindings);
    }
    const timeline = createTimelineBinding(baseProfile);
    if (timeline) {
        bindings.push(timeline);
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
