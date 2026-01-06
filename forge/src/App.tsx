import { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { Grid } from './components/Grid';
import { PlayerPanel } from './components/PlayerPanel';
import { Tableau } from './components/Tableau';
import { BidModal } from './components/BidModal';
import { CounterBidModal } from './components/CounterBidModal';
import { calculateWinner } from './game/scoring';
import type { Position } from './game/types';

type ModalState =
  | { type: 'none' }
  | { type: 'buy'; pos: Position }
  | { type: 'counter' }
  | { type: 'final' }
  | { type: 'burn_confirm'; pos: Position };

function App() {
  const { gameState, actions } = useGameState();
  const [modalState, setModalState] = useState<ModalState>({ type: 'none' });

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  const handleCardClick = (x: number, y: number) => {
    if (gameState.phase !== 'playing') return;

    setModalState({ type: 'buy', pos: { x, y } });
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
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-5xl font-bold mb-8 text-center">GAME OVER</h1>

          <div className="bg-gray-800 p-8 rounded-lg mb-8">
            {winner === 'tie' ? (
              <h2 className="text-3xl font-bold text-center mb-4">It's a Tie!</h2>
            ) : (
              <h2 className="text-3xl font-bold text-center mb-4">
                {gameState.players[winner].name} Wins!
              </h2>
            )}

            <div className="grid grid-cols-2 gap-8">
              {gameState.players.map((player, idx) => (
                <div key={player.id} className="text-center">
                  <div className="text-2xl font-bold mb-2">{player.name}</div>
                  <div className="text-4xl text-yellow-400 mb-2">{scores[idx]} VP</div>
                  <div className="text-gray-400">
                    <div>{player.tableau.length} cards</div>
                    <div>
                      {player.symbols.mars + player.symbols.venus + player.symbols.mercury + player.symbols.moon}{' '}
                      symbols left
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center">
              <button
                onClick={actions.newGame}
                className="bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-lg text-xl font-bold"
              >
                New Game
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
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="container mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-4xl font-bold">FORGE</h1>
          <button
            onClick={actions.newGame}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded"
          >
            New Game
          </button>
        </div>

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

        <div className="mb-4">
          <Grid grid={gameState.grid} onCardClick={handleCardClick} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Tableau cards={gameState.players[0].tableau} playerName={gameState.players[0].name} />
          <Tableau cards={gameState.players[1].tableau} playerName={gameState.players[1].name} />
        </div>

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
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-bold mb-4">Burn this card?</h2>
              <div className="flex gap-4">
                <button
                  onClick={() => setModalState({ type: 'none' })}
                  className="bg-gray-700 px-4 py-2 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBurnConfirm}
                  className="bg-red-600 px-4 py-2 rounded"
                >
                  Burn
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
