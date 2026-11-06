import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from './input.jsx';
import { Textarea } from './textarea.jsx';

describe('text boxes', () => {
  it('keep browsers and password managers out, whatever a screen asks for', () => {
    render(
      <>
        <Input aria-label="Name" autoComplete="given-name" />
        <Input aria-label="Password" type="password" autoComplete="current-password" />
        <Textarea aria-label="Remarks" />
      </>,
    );
    for (const [label, autoComplete] of [
      ['Name', 'off'],
      ['Password', 'new-password'],
      ['Remarks', 'off'],
    ]) {
      const box = screen.getByLabelText(label);
      expect(box).toHaveAttribute('autocomplete', autoComplete);
      expect(box).toHaveAttribute('data-lpignore', 'true');
      expect(box).toHaveAttribute('data-1p-ignore', 'true');
      expect(box).toHaveAttribute('data-bwignore', 'true');
      expect(box).toHaveAttribute('data-form-type', 'other');
    }
  });
});
