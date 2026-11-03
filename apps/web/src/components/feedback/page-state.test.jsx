import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-error';

import { PageState } from './page-state.jsx';

describe('PageState', () => {
  it('announces loading', () => {
    render(<PageState state="loading" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows a safe error message, the reference and a retry button', async () => {
    const onRetry = vi.fn();
    const error = new ApiError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side.',
      requestId: 'req-123',
    });
    render(<PageState state="error" error={error} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on our side.');
    expect(screen.getByText('Reference: req-123')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('explains network failures in plain words', () => {
    render(<PageState state="error" error={new TypeError('Failed to fetch')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server');
  });

  it('renders an empty state with an action', () => {
    render(
      <PageState
        state="empty"
        title="No sales yet"
        action={<button type="button">New sale</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No sales yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New sale' })).toBeInTheDocument();
  });
});
