/** Registry for shipped + runtime floor/wall procedural texture profiles. */
export class FloorProfileProvider {
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
            throw new Error(`Unknown floor procedural profile: ${id}`);
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

export function setFloorProfileProvider(provider) {
    activeProvider = provider;
}

export function getFloorProfileProvider() {
    if (!activeProvider) {
        throw new Error(
            "FloorProfileProvider not configured. Call installGameFloorProfileProvider() during bootstrap."
        );
    }
    return activeProvider;
}

export function isFloorProfileProviderInstalled() {
    return activeProvider !== null;
}

/**
 * @param {FloorProfileProvider | { profiles?: Record<string, object>, defaultProfileId?: string|null }} source
 */
export function installFloorProfileProvider(source) {
    const provider =
        source instanceof FloorProfileProvider
            ? source
            : new FloorProfileProvider(source);
    setFloorProfileProvider(provider);
    return provider;
}
