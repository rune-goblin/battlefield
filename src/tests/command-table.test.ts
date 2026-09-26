import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../runtime/commandTable.js';

const EXECUTOR_OWNED = ['session.undo', 'session.load', 'session.install', 'session.moveTo'];

describe('the command table', () => {
  it('names a side for every side-scoped command and for no other', () => {
    for (const [type, descriptor] of Object.entries(COMMANDS)) {
      expect(typeof descriptor.side, type).toBe(descriptor.scope === 'side' ? 'function' : 'undefined');
    }
  });

  it('runs every command the executor does not run itself', () => {
    for (const [type, descriptor] of Object.entries(COMMANDS)) {
      expect(typeof descriptor.run, type).toBe(EXECUTOR_OWNED.includes(type) ? 'undefined' : 'function');
    }
  });
});
