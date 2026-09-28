// The id in a route path: a positive whole number, else undefined, which the
// route answers as an unknown id. First use: professionals/route.server.ts;
// second use: weeklyHours/route.server.ts.
export function idOf(param: string): number | undefined {
	if (!/^[1-9]\d*$/.test(param)) return undefined;
	const id = Number(param);
	return Number.isSafeInteger(id) ? id : undefined;
}
