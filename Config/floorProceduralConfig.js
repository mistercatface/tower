export const floorProceduralProfiles = {};

async function loadDynamicProfiles() {
    try {
        const response = await fetch('/Config/TileLabStorage/');
        if (!response.ok) return;
        const text = await response.text();
        const matches = text.matchAll(/href="([^"]+\.js)"/g);
        for (const match of matches) {
            const fileName = match[1];
            const profileId = fileName.replace('.js', '');
            try {
                const module = await import(`./TileLabStorage/${fileName}`);
                floorProceduralProfiles[profileId] = module.default;
            } catch (e) {
                console.error(`Failed to load profile ${fileName}`, e);
            }
        }
    } catch (e) {
        console.warn("Failed to dynamically fetch directory listing (expected if directory indexing is disabled on production server).", e);
    }
}

await loadDynamicProfiles();


export const START_STATION_ID = "shatteredDimension";

export const defaultFloorProceduralProfileId = START_STATION_ID;

export const startFloorProceduralProfileId = START_STATION_ID;

export const floorProceduralProfileByStrategy = {
    StartBuildingStrategy: START_STATION_ID,
    MazeStrategy: START_STATION_ID,
    Maze2Strategy: START_STATION_ID,
    DenseMazeStrategy: START_STATION_ID,
    SquareStrategy: START_STATION_ID,
    GeometricStrategy: START_STATION_ID,
    FortressStrategy: START_STATION_ID,
    HoneycombStrategy: START_STATION_ID,
    DiamondStrategy: START_STATION_ID,
};

const runtimeFloorProfiles = {};

// Custom dynamic profiles loaded from TileLabStorage in the UI
const customFloorProfiles = {};

export function registerRuntimeFloorProfile(profileId, profile) {
    runtimeFloorProfiles[profileId] = profile;
}

export function unregisterRuntimeFloorProfile(profileId) {
    delete runtimeFloorProfiles[profileId];
}

// Dynamically registers profiles scanned from local disk (FSA API in TileLab)
export function registerCustomFloorProfile(profileId, profile) {
    customFloorProfiles[profileId] = profile;
}

export function unregisterCustomFloorProfile(profileId) {
    delete customFloorProfiles[profileId];
}

export function getFloorProceduralProfile(profileId) {
    const profile = runtimeFloorProfiles[profileId] ?? customFloorProfiles[profileId] ?? floorProceduralProfiles[profileId];
    if (!profile) {
        throw new Error(`Unknown floor procedural profile: ${profileId}`);
    }
    return profile;
}

export function listShippedFloorProfileIds() {
    return Object.keys(floorProceduralProfiles);
}

export function listAllFloorProfileIds() {
    const shipped = listShippedFloorProfileIds();
    const customs = Object.keys(customFloorProfiles);
    const unique = new Set([...shipped, ...customs]);
    return Array.from(unique);
}

export function resolveFloorTextureProfileId({ layer, strategy }) {
    if (layer === 0) {
        return startFloorProceduralProfileId;
    }
    const profileId = floorProceduralProfileByStrategy[strategy];
    if (!profileId) {
        throw new Error(`No floor procedural profile mapped for strategy: ${strategy}`);
    }
    return profileId;
}