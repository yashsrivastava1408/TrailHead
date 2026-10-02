import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Bar, Banner, CountUp, Ring, Skeleton, Stat } from '../src/components/ui.jsx';

describe('ui primitives', () => {
  it('Bar clamps its value between 0 and 100', () => {
    const { rerender } = render(<Bar value={150} />);
    expect(screen.getByRole('progressbar').firstChild.style.width).toBe('100%');
    rerender(<Bar value={-20} />);
    expect(screen.getByRole('progressbar').firstChild.style.width).toBe('0%');
    rerender(<Bar value={42} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('CountUp shows the final number straight away when motion is reduced, and passes text through', () => {
    const { container, rerender } = render(<CountUp value={63} suffix="%" />);
    expect(container).toHaveTextContent('63%');
    rerender(<CountUp value="—" />);
    expect(container).toHaveTextContent('—');
  });

  it('Ring is labelled for screen readers', () => {
    render(<Ring value={72} />);
    expect(screen.getByRole('img', { name: '72 percent' })).toBeInTheDocument();
  });

  it('Stat shows label, value and hint', () => {
    render(<Stat label="Skills found" value={10} hint="8 repos read" />);
    expect(screen.getByText('Skills found')).toBeInTheDocument();
    expect(screen.getByText('8 repos read')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('error banners use role=alert so assistive tech announces them', () => {
    const { rerender } = render(<Banner tone="error" title="Oops">bad</Banner>);
    expect(screen.getByRole('alert')).toHaveTextContent('Oops');
    rerender(<Banner title="Heads up">careful</Banner>);
    expect(screen.getByRole('status')).toHaveTextContent('Heads up');
  });

  it('Skeleton is hidden from assistive tech', () => {
    const { container } = render(<Skeleton height={10} />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
