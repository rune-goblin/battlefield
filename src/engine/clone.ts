// The JSON round trip drops `undefined` keys; structuredClone would keep them and break deep equality with saved state.
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
