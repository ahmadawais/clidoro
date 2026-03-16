import { describe, expect, it } from 'vitest';
import { deletePreviousWord, isDeletePreviousWordKey } from './interactive-tui.js';

describe('task entry editing', () => {
  it('deletes the previous word while preserving earlier spacing', () => {
    expect(deletePreviousWord('write docs')).toBe('write ');
    expect(deletePreviousWord('write   docs')).toBe('write   ');
    expect(deletePreviousWord('docs')).toBe('');
  });

  it('deletes the previous word even when the input ends with whitespace', () => {
    expect(deletePreviousWord('write docs   ')).toBe('write ');
    expect(deletePreviousWord('   ')).toBe('');
  });

  it('recognizes common previous-word deletion key sequences', () => {
    expect(isDeletePreviousWordKey('\u0017')).toBe(true);
    expect(isDeletePreviousWordKey('\u001b\u007f')).toBe(true);
    expect(isDeletePreviousWordKey('\u001b\u0008')).toBe(true);
    expect(isDeletePreviousWordKey('\u001b\b')).toBe(true);
    expect(isDeletePreviousWordKey('\u007f')).toBe(false);
  });
});
