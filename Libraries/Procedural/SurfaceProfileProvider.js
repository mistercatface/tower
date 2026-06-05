/** Registry for shipped + runtime procedural surface profiles (ground + walls). */
export class SurfaceProfileProvider {
    /**
     * @param {{ profiles?: Record<string, object>, defaultProfileId?: string|null }} [options]
     */
    constructor({ profiles = {}, defaultProfileId = null } = {}) {
        this.shippedProfiles = { ...profiles };
        this.runtimeProfiles = {};
        this.defaultProfileId =
            defaultProfileId ?? Object.keys(this.shippedProfiles)[0] ?? null;
    }

    get defaultId() {
        return this.defaultProfileId;
    }

    registerRuntime(profileId, profile) {
        this.runtimeProfiles[profileId] = profile;
    }

    getProfile(profileId) {
        const id = profileId ?? this.defaultProfileId;
        const profile = this.runtimeProfiles[id] ?? this.shippedProfiles[id];
        if (!profile) {
            throw new Error(`Unknown surface procedural profile: ${id}`);
        }
        return profile;
    }

    hasProfile(profileId) {
        return Boolean(this.runtimeProfiles[profileId] ?? this.shippedProfiles[profileId]);
    }

    listShippedIds() {
        return Object.keys(this.shippedProfiles);
    }

    listKnownIds() {
        return [
            ...new Set([
                ...Object.keys(this.shippedProfiles),
                ...Object.keys(this.runtimeProfiles),
            ]),
        ];
    }
}

let activeProvider = null;

export function setSurfaceProfileProvider(provider) {
    activeProvider = provider;
}

export function getSurfaceProfileProvider() {
    if (!activeProvider) {
        throw new Error(
            "SurfaceProfileProvider not configured. Call installGameSurfaceProfileProvider() during bootstrap."
        );
    }
    return activeProvider;
}

export function isSurfaceProfileProviderInstalled() {
    return activeProvider !== null;
}

/**
 * @param {SurfaceProfileProvider | { profiles?: Record<string, object>, defaultProfileId?: string|null }} source
 */
export function installSurfaceProfileProvider(source) {
    const provider =
        source instanceof SurfaceProfileProvider
            ? source
            : new SurfaceProfileProvider(source);
    setSurfaceProfileProvider(provider);
    return provider;
}
