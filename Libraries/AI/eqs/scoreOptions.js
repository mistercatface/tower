export function scoreOptions(options, tests) {
    const scoredOptions = [];
    let best = null;
    for (const option of options) {
        let score = 0;
        const testScores = {};
        let rejected = false;
        for (const test of tests) {
            const raw = test.score(option);
            testScores[test.id] = raw;
            if (raw === -Infinity) {
                score = -Infinity;
                rejected = true;
                break;
            }
            score += raw * (test.weight ?? 1);
        }
        const scored = { option, score, testScores };
        scoredOptions.push(scored);
        if (!rejected && (!best || score > best.score)) best = scored;
    }
    return { best: best?.option ?? null, bestScore: best?.score ?? -Infinity, scoredOptions };
}
