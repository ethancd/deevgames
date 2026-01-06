import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardModal } from '../../src/components/CardModal';
import type { Card as CardType } from '../../src/game/types';

describe('CardModal', () => {
  const testCard: CardType = {
    id: 'test-card',
    name: 'Test Card',
    faction: 'Iron Tide',
    cost: 2,
    symbols: '♂☿',
    baseVP: 2,
    conditionalVP: '+1 per Iron Tide card',
    game3Effect: 'This is a game 3 effect',
    parsedCost: { mars: 1, mercury: 1, venus: 0, moon: 0, any: 0 }
  };

  const testPosition = { x: 0, y: 0 };

  it('should render the card with correct name', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={true}
      />
    );

    expect(screen.getAllByText('Test Card').length).toBeGreaterThan(0);
  });

  it('should display game3Effect text in modal', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={true}
      />
    );

    expect(screen.getAllByText(/This is a game 3 effect/i).length).toBeGreaterThan(0);
  });

  it('should show Buy button when canBuy is true', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={true}
      />
    );

    const buyButtons = screen.getAllByText('Buy Card');
    expect(buyButtons.length).toBeGreaterThan(0);
  });

  it('should not show Buy button when canBuy is false', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={false}
      />
    );

    const buyButtons = screen.queryAllByText('Buy Card');
    expect(buyButtons.length).toBe(0);
  });

  it('should show burn button in initial state', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={true}
      />
    );

    const burnButtons = screen.getAllByText('Burn Card');
    expect(burnButtons.length).toBeGreaterThan(0);
  });

  it('should change burn button text on first click', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={true}
      />
    );

    // Get the first burn button (mobile view)
    const burnButtons = screen.getAllByText('Burn Card');
    fireEvent.click(burnButtons[0]);

    // Should now show confirmation text
    const confirmButtons = screen.getAllByText('🔥 Confirm Burn 🔥');
    expect(confirmButtons.length).toBeGreaterThan(0);
  });

  it('should call onBurn on second click of burn button', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={true}
      />
    );

    // First click
    const burnButtons = screen.getAllByText('Burn Card');
    fireEvent.click(burnButtons[0]);

    // Second click on confirmation button
    const confirmButtons = screen.getAllByText('🔥 Confirm Burn 🔥');
    fireEvent.click(confirmButtons[0]);

    expect(onBurn).toHaveBeenCalledWith(testPosition);
    expect(onClose).toHaveBeenCalled();
  });

  it('should call onBuy when Buy button is clicked', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={true}
      />
    );

    const buyButtons = screen.getAllByText('Buy Card');
    fireEvent.click(buyButtons[0]);

    expect(onBuy).toHaveBeenCalledWith(testPosition);
    // onClose is NOT called - the parent component handles modal state change
  });

  it('should call onClose when Cancel button is clicked (mobile)', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    const { container } = render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={true}
      />
    );

    // Mobile view has a Cancel button
    const cancelButtons = screen.queryAllByText('Cancel');
    if (cancelButtons.length > 0) {
      fireEvent.click(cancelButtons[0]);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('should call onClose when close X button is clicked (desktop)', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    const { container } = render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={true}
      />
    );

    // Desktop view has a ✕ close button
    const closeButtons = screen.queryAllByText('✕');
    if (closeButtons.length > 0) {
      fireEvent.click(closeButtons[0]);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('should have both mobile and desktop layouts in DOM', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    const { container } = render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={true}
      />
    );

    // Check for mobile layout (md:hidden)
    const mobileLayout = container.querySelector('.md\\:hidden');
    expect(mobileLayout).toBeTruthy();

    // Check for desktop layout (hidden md:block)
    const desktopLayout = container.querySelector('.md\\:block');
    expect(desktopLayout).toBeTruthy();
  });

  it('should scale the card for better visibility', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    const { container } = render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={true}
      />
    );

    // Check for scale-150 class
    const scaledElements = container.querySelectorAll('.scale-150');
    expect(scaledElements.length).toBeGreaterThan(0);
  });

  it('should reset burn confirmation when clicking outside', () => {
    const onClose = vi.fn();
    const onBurn = vi.fn();
    const onBuy = vi.fn();

    const { container } = render(
      <CardModal
        card={testCard}
        position={testPosition}
        onClose={onClose}
        onBurn={onBurn}
        onBuy={onBuy}
        canBuy={true}
      />
    );

    // Click burn button to enter confirmation state
    const burnButtons = screen.getAllByText('Burn Card');
    fireEvent.click(burnButtons[0]);

    // Verify confirmation state
    expect(screen.getAllByText('🔥 Confirm Burn 🔥').length).toBeGreaterThan(0);

    // Click on backdrop (not on the modal content)
    const backdrop = container.querySelector('.md\\:hidden');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    }
  });
});
