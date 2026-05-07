
export function calculatePercentage(value: any): number {
    if (value === null || value === undefined) return 0;
    
    const num = parseFloat(value);
    if (isNaN(num)) return 0;

    const result = num <= 1 && num > 0 ? num * 100 : num;

    return Math.round((result + Number.EPSILON) * 100) / 100;
}

export function getScoreTrafficLight(score: number): string {
    if (score >= 8) return 'verde';
    if (score >= 6) return 'amarillo';
    return 'rojo';
}