import { useState, useEffect } from 'react';
import { useGameState } from './hooks/useGameState';
import { Grid } from './components/Grid';
import { PlayerPanel } from './components/PlayerPanel';
import { Tableau } from './components/Tableau';
import { BidModal } from './components/BidModal';
import { CounterBidModal } from './components/CounterBidModal';
import { CardModal } from './components/CardModal';
import { CardBrowser } from './components/CardBrowser';
import { SkinSelectorCompact } from './components/SkinSelector';
import { calculateWinner } from './game/scoring';
import type { Position } from './game/types';

type ModalState =
  | { type: 'none' }
  | { type: 'card_detail'; pos: Position }
  | { type: 'buy'; pos: Position }
  | { type: 'counter' }
  | { type: 'final' }
  | { type: 'burn_confirm'; pos: Position };

function App() {
  const { gameState, actions } = useGameState();
  const [modalState, setModalState] = useState<ModalState>({ type: 'none' });
  const [currentPage, setCurrentPage] = useState(() => {
    return window.location.hash === '#/cards' ? 'cards' : 'game';
  });

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPage(window.location.hash === '#/cards' ? 'cards' : 'game');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (currentPage === 'cards') {
    return <CardBrowser />;
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  const handleCardClick = (x: number, y: number) => {
    if (gameState.phase !== 'playing') return;

    setModalState({ type: 'card_detail', pos: { x, y } });
  };

  const handleCardModalBuy = (pos: Position) => {
    setModalState({ type: 'buy', pos });
  };

  const handleCardModalBurn = (pos: Position) => {
    actions.burn(pos);
  };

  const handleBuyConfirm = (payment: typeof currentPlayer.symbols) => {
    if (modalState.type === 'buy') {
      actions.buyCard(modalState.pos, payment);
      setModalState({ type: 'counter' });
    }
  };

  const handleCounterDecline = () => {
    actions.declineInitialBid();
    setModalState({ type: 'none' });
  };

  const handleCounter = () => {
    setModalState({ type: 'none' });
  };

  const handleBurnConfirm = () => {
    if (modalState.type === 'burn_confirm') {
      actions.burn(modalState.pos);
      setModalState({ type: 'none' });
    }
  };

  if (gameState.phase === 'game_over') {
    const { winner, scores } = calculateWinner(gameState);

    return (
      <div className="min-h-screen p-8 animate-fadeIn">
        <div className="container mx-auto max-w-5xl">
          <h1
            className="text-6xl font-bold mb-8 text-center text-shadow-glow"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
          >
            GAME OVER
          </h1>

          <div className="glass-panel p-8 rounded-xl mb-8 border-2 border-amber-600/30 shadow-2xl animate-slideIn">
            {winner === 'tie' ? (
              <h2
                className="text-4xl font-bold text-center mb-6"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--silver)' }}
              >
                ⚔ It's a Tie! ⚔
              </h2>
            ) : (
              <h2
                className="text-4xl font-bold text-center mb-6"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
              >
                ★ {gameState.players[winner].name} Wins! ★
              </h2>
            )}

            <div className="grid grid-cols-2 gap-8 mb-8">
              {gameState.players.map((player, idx) => (
                <div
                  key={player.id}
                  className={`text-center p-6 rounded-lg border-2 ${
                    winner !== 'tie' && winner === idx
                      ? 'border-amber-500 bg-amber-950/30'
                      : 'border-amber-900/30 bg-transparent'
                  }`}
                >
                  <div className="text-2xl font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    {player.name}
                  </div>
                  <div
                    className="text-5xl mb-3"
                    style={{
                      fontFamily: 'var(--font-display)',
                      color: winner !== 'tie' && winner === idx ? 'var(--gold)' : 'var(--bronze)',
                    }}
                  >
                    {scores[idx]} VP
                  </div>
                  <div className="text-amber-600 text-sm">
                    <div>{player.tableau.length} cards</div>
                    <div>
                      {player.symbols.mars + player.symbols.venus + player.symbols.mercury + player.symbols.moon}{' '}
                      symbols remaining
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center">
              <button
                onClick={actions.newGame}
                className="bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 px-10 py-4 rounded-lg text-xl font-bold shadow-lg hover:shadow-amber-500/50 transition-all duration-200 border-2 border-amber-500"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                ⚔ New Game ⚔
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {gameState.players.map(player => (
              <Tableau key={player.id} cards={player.tableau} playerName={player.name} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col animate-fadeIn overflow-hidden">
      {/* Fixed Header */}
      <header className="flex-shrink-0 p-4 border-b border-amber-900/30">
        <div className="container mx-auto max-w-7xl flex items-center justify-between">
          <h1
            className="text-5xl font-bold tracking-wider text-shadow-glow"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
          >
            ⚔ FORGE ⚔
          </h1>
          <div className="flex items-center gap-3">
            <SkinSelectorCompact />
            <a
              href="#/cards"
              className="glass-panel px-6 py-3 rounded-lg font-bold hover:border-amber-500 border-2 border-amber-900/30 transition-all duration-200 shadow-lg hover:shadow-amber-500/30"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--bronze)' }}
            >
              Card Gallery
            </a>
            <button
              onClick={actions.newGame}
              className="glass-panel px-6 py-3 rounded-lg font-bold hover:border-amber-500 border-2 border-amber-900/30 transition-all duration-200 shadow-lg hover:shadow-amber-500/30"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--bronze)' }}
            >
              New Game
            </button>
          </div>
        </div>
      </header>

      {/* Scrollable Grid Area */}
      <div className="flex-1 overflow-auto p-4">
        <div className="container mx-auto max-w-7xl flex justify-center">
          <Grid grid={gameState.grid} onCardClick={handleCardClick} />
        </div>
      </div>

      {/* Fixed Player Info & Tableaus */}
      <footer className="flex-shrink-0 border-t border-amber-900/30 p-4 bg-stone-950/80 backdrop-blur">
        <div className="container mx-auto max-w-7xl">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <PlayerPanel
              player={gameState.players[0]}
              isCurrentPlayer={gameState.currentPlayerIndex === 0}
              gameState={gameState}
            />
            <PlayerPanel
              player={gameState.players[1]}
              isCurrentPlayer={gameState.currentPlayerIndex === 1}
              gameState={gameState}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Tableau cards={gameState.players[0].tableau} playerName={gameState.players[0].name} />
            <Tableau cards={gameState.players[1].tableau} playerName={gameState.players[1].name} />
          </div>
        </div>
      </footer>

      {/* Modals */}
      {modalState.type === 'card_detail' && (() => {
        const cell = gameState.grid.cells.get(`${modalState.pos.x},${modalState.pos.y}`);
        if (!cell || cell.type !== 'card' || !cell.card) return null;

        const isAvailable = cell.faceUp; // Simple check for now - can be refined

        return (
          <CardModal
            card={cell.card}
            position={modalState.pos}
            onClose={() => setModalState({ type: 'none' })}
            onBurn={handleCardModalBurn}
            onBuy={handleCardModalBuy}
            canBuy={isAvailable}
          />
        );
      })()}

      {modalState.type === 'buy' && (
        <BidModal
          card={
            gameState.grid.cells.get(`${modalState.pos.x},${modalState.pos.y}`)!.card!
          }
          availableSymbols={currentPlayer.symbols}
          requiredCost={
            gameState.grid.cells.get(`${modalState.pos.x},${modalState.pos.y}`)!.card!
              .parsedCost
          }
          onConfirm={handleBuyConfirm}
          onCancel={() => setModalState({ type: 'none' })}
        />
      )}

      {modalState.type === 'counter' && gameState.activeBid && (
        <CounterBidModal
          card={
            gameState.grid.cells.get(
              `${gameState.activeBid.cardPos.x},${gameState.activeBid.cardPos.y}`
            )!.card!
          }
          onCounter={handleCounter}
          onDecline={handleCounterDecline}
        />
      )}

      {modalState.type === 'burn_confirm' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="glass-panel p-8 rounded-xl border-2 border-red-600/30 shadow-2xl animate-slideIn">
            <h2
              className="text-2xl font-bold mb-6 text-center"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
            >
              🔥 Burn this card? 🔥
            </h2>
            <div className="flex gap-4">
              <button
                onClick={() => setModalState({ type: 'none' })}
                className="flex-1 glass-panel px-6 py-3 rounded-lg font-bold border-2 border-amber-900/30 hover:border-amber-700 transition-all"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--bronze)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleBurnConfirm}
                className="flex-1 bg-gradient-to-r from-red-800 to-red-700 hover:from-red-700 hover:to-red-600 px-6 py-3 rounded-lg font-bold shadow-lg hover:shadow-red-500/50 transition-all border-2 border-red-600"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Burn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
