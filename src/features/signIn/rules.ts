export const sessionDays = 30;

const dayMilliseconds = 24 * 60 * 60 * 1000;

export function isSessionLive(expiresAt: string, now: Date): boolean {
	return now.getTime() < Date.parse(expiresAt);
}

export function sessionExpiry(now: Date): string {
	return new Date(now.getTime() + sessionDays * dayMilliseconds).toISOString();
}
