export function calculateFinalScore(criteria: any[]) {
    if (!criteria || criteria.length === 0) return null;

    const hasWeights = criteria.some(c => c.EntrevistasCriterios.weight !== null);

    if (hasWeights) {
        let total = 0;

        for (const c of criteria) {
            const max = c.EntrevistasCriterios.max_score;
            const weight = c.EntrevistasCriterios.weight || 0;
            const score = c.score || 0;

            total += (score / max) * weight;
        }

        return Number(total.toFixed(2));
    } else {
        let total = 0;

        for (const c of criteria) {
            const max = c.EntrevistasCriterios.max_score;
            const score = c.score || 0;

            total += score / max;
        }

        return Number(((total / criteria.length) * 100).toFixed(2));
    }
}