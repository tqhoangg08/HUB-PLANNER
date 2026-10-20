// Imported only by the isolated acceptance Vite server, never by the application build.
import { useState } from 'react';
const setters = new Map<string, (value: unknown) => void>();
export function useFixtureState(file: string, name: string, initial?: unknown) {
  const state = useState(initial);
  setters.set(`${file}:${name}`, state[1]);
  return state;
}
Object.assign(window, { acceptanceState(file: string, values: Record<string, unknown>) {
  for (const [name, value] of Object.entries(values)) {
    const setter = setters.get(`${file}:${name}`);
    if (!setter) throw new Error(`Unknown fixture state ${file}:${name}`);
    setter(value);
  }
} });
