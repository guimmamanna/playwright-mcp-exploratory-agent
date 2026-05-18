/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeverityBadge } from '../src/components/ui/badge';

describe('SeverityBadge', () => {
  it('renders severity label', () => {
    render(<SeverityBadge severity="critical" />);
    expect(screen.getByText('critical')).toBeTruthy();
  });
});
