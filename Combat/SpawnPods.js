import { enemyTypes, firstWaveSpawnPods, spawnPods } from "../Config/Config.js";

const CHARGER_TYPES = new Set(["kamikaze", "spastic"]);
const FIRST_WAVE_MIN_POD_SIZE = 3;
const FIRST_WAVE_MAX_POD_SIZE = 5;
const FIRST_WAVE_MAX_CHARGERS = 2;

const FALLBACK_POD = {
    id: "fallback_standard",
    members: [{ type: "standard", count: 1 }],
};

export function getPodSize(pod) {
    return pod.members.reduce((sum, member) => sum + member.count, 0);
}

function countChargersInPod(pod) {
    return pod.members.reduce(
        (sum, member) => sum + (CHARGER_TYPES.has(member.type) ? member.count : 0),
        0,
    );
}

function isFirstWavePodValid(pod) {
    const size = getPodSize(pod);
    if (size < FIRST_WAVE_MIN_POD_SIZE || size > FIRST_WAVE_MAX_POD_SIZE) return false;
    if (countChargersInPod(pod) > FIRST_WAVE_MAX_CHARGERS) return false;
    return pod.members.every((member) => {
        const type = member.type;
        return type === "standard" || type === "tank" || type === "kamikaze";
    });
}

export function getEnemyType(typeName) {
    return enemyTypes.find((entry) => entry.type === typeName) ?? null;
}

function isPodEligible(pod, maxSize) {
    const size = getPodSize(pod);
    if (maxSize !== undefined && size > maxSize) {
        return false;
    }
    return pod.members.every((member) => getEnemyType(member.type) !== null);
}

function pickWeightedPod(candidates) {
    const totalWeight = candidates.reduce((sum, pod) => sum + (pod.weight ?? 1), 0);
    let rand = Math.random() * totalWeight;

    for (const pod of candidates) {
        const weight = pod.weight ?? 1;
        if (rand < weight) {
            return pod;
        }
        rand -= weight;
    }

    return candidates[candidates.length - 1];
}

function buildRemainderPod(remaining) {
    return {
        id: "remainder",
        members: [{ type: "standard", count: remaining }],
    };
}

function getSpawnPodPool(state) {
    if (state.waveManager?.wave === 1) {
        return firstWaveSpawnPods.filter(isFirstWavePodValid);
    }
    return spawnPods;
}

export function selectSpawnPod(state, remainingEnemies) {
    if (remainingEnemies <= 0) {
        return FALLBACK_POD;
    }

    const pool = getSpawnPodPool(state);
    const fittingPods = pool.filter((pod) => isPodEligible(pod, remainingEnemies));
    if (fittingPods.length > 0) {
        return pickWeightedPod(fittingPods);
    }

    if (state.waveManager?.wave === 1 && remainingEnemies >= FIRST_WAVE_MIN_POD_SIZE) {
        const standardCount = Math.min(remainingEnemies, FIRST_WAVE_MAX_POD_SIZE);
        return {
            id: "fw_remainder",
            members: [{ type: "standard", count: standardCount }],
        };
    }

    return buildRemainderPod(remainingEnemies);
}

export function getBossPod() {
    return {
        id: "boss",
        members: [{ type: "boss", count: 1 }],
    };
}
