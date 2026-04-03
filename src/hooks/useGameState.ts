import { useState } from 'react';
import type { GameState } from '../types/game';
import { GameEngine, createInitialGameState } from '../engine/GameEngine';
import { fetchCardsByDeck } from '../api/optcg';

export function useGameState() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [screen, setScreen] = useState<'setup' | 'playing'>('setup');

  const startGame = async (
    p1DeckId: string,
    p2DeckId: string,
    options?: { firstPlayerId?: 'P1' | 'P2'; seed?: number }
  ): Promise<GameState | null> => {
    setLoading(true);
    setScreen('playing');
    
    const p1DeckFull = await fetchCardsByDeck(p1DeckId);
    const p2DeckFull = await fetchCardsByDeck(p2DeckId);
    
    // Garantir Fallbacks visuais pra carregar caso id retorne vazio
    const p1Leader = p1DeckFull.find(c => c.type === 'leader')!;
    const p1Deck = p1DeckFull.filter(c => c.type !== 'leader');
    const p2Leader = p2DeckFull.find(c => c.type === 'leader')!;
    const p2Deck = p2DeckFull.filter(c => c.type !== 'leader');

    const firstPlayer = options?.firstPlayerId ?? (Math.random() < 0.5 ? 'P1' : 'P2');
    const initialState = createInitialGameState(p1Deck, p1Leader, p2Deck, p2Leader, firstPlayer, {
      seed: options?.seed
    });
    setGameState(initialState);
    setLoading(false);
    return initialState;
  };

  const advancePhase = (): GameState | null => {
    let nextState: GameState | null = null;
    setGameState(prev => {
      if (!prev) return prev;
      nextState = GameEngine.advancePhase(prev);
      return nextState;
    });
    return nextState;
  };

  const dispatchAction = (action: any): GameState | null => {
    let nextState: GameState | null = null;
    setGameState(prev => {
      if (!prev) return prev;
      nextState = GameEngine.processAction(prev, action);
      return nextState;
    });
    return nextState;
  };

  const replaceGameState = (nextState: GameState | null): void => {
    setGameState(nextState);
    if (nextState) setScreen('playing');
  };

  return {
    gameState,
    loading,
    screen,
    startGame,
    advancePhase,
    dispatchAction,
    replaceGameState
  };
}
