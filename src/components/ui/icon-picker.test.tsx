import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IconPicker, IconDisplay } from './icon-picker';
import React from 'react';

// Mock iconMap
vi.mock('@/components/ui/icons/icons', () => ({
  iconMap: {
    House: (props: any) => <svg {...props} data-testid="icon-house" />,
    Smile: (props: any) => <svg {...props} data-testid="icon-smile" />,
  },
}));

// Mock ResizeObserver
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('IconPicker', () => {
  it('renders selected icon', () => {
    render(<IconPicker value="House" onChange={() => {}} />);
    expect(screen.getByText('House')).toBeInTheDocument();
    expect(screen.getByTestId('icon-house')).toBeInTheDocument();
  });

  it('renders placeholder when no value', () => {
    render(<IconPicker value="" onChange={() => {}} />);
    expect(screen.getByText('Select icon...')).toBeInTheDocument();
  });

  it('opens popover and selects icon', async () => {
    const onChange = vi.fn();
    render(<IconPicker value="" onChange={onChange} />);

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    // Wait for popover to open
    await waitFor(() => {
       expect(screen.getByPlaceholderText('Search icons...')).toBeInTheDocument();
    });

    // Check if icons are displayed
    expect(screen.getByTitle('House')).toBeInTheDocument();
    expect(screen.getByTitle('Smile')).toBeInTheDocument();

    // Select Smile
    fireEvent.click(screen.getByTitle('Smile'));

    expect(onChange).toHaveBeenCalledWith('Smile');
  });

  it('filters icons', async () => {
    render(<IconPicker value="" onChange={() => {}} />);

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    await waitFor(() => {
       expect(screen.getByPlaceholderText('Search icons...')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search icons...');
    fireEvent.change(searchInput, { target: { value: 'House' } });

    expect(screen.getByTitle('House')).toBeInTheDocument();
    expect(screen.queryByTitle('Smile')).not.toBeInTheDocument();
  });

  it('IconDisplay renders icon', () => {
    render(<IconDisplay name="House" className="test-class" />);
    const icon = screen.getByTestId('icon-house');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('test-class');
  });

  it('IconDisplay renders nothing for invalid name', () => {
    const { container } = render(<IconDisplay name="Invalid" />);
    expect(container).toBeEmptyDOMElement();
  });
});
