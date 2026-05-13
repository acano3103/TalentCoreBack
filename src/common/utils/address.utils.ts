export function quotePlus(text: string): string {
    return encodeURIComponent(text).replace(/%20/g, '+');
}