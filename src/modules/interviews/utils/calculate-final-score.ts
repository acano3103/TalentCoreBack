export function calculateFinalScore(criteria: any[]) {
    if (!criteria || criteria.length === 0) return null;

    const total = criteria.reduce((acc, c) => {
        const score = Number(c.score) || 0;
        return acc + score;
    }, 0);

    return Number(total.toFixed(2));
}