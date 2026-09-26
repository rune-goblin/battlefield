// The JSON round trip keeps `undefined` keys and deep equality the way saves expect;
// `structuredClone` drops them and would change both.
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
