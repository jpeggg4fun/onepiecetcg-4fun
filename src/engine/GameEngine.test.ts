import { describe, it, expect, vi } from 'vitest';
import { GameEngine, createInitialGameState } from './GameEngine';
import type { Card, GameState, LeaderCard } from '../types/game';

function createMockCard(id: string, type: Card['type'] = 'character', overrides: Partial<Card> = {}): Card {
  return {
    id,
    card_number: 'MOCK-001',
    type,
    color: ['red'],
    cost: 1,
    power: 5000,
    base_power: 5000,
    counter: 1000,
    keywords: [],
    trigger: null,
    effect: null,
    state: { rested: false, location: 'deck' },
    name: `Mock ${id}`,
    ...overrides
  } as Card;
}

function createMockLeader(id: string, life: number): LeaderCard {
  return {
    ...createMockCard(id, 'leader'),
    life
  } as LeaderCard;
}

function generateDeck(count: number, prefix: string): Card[] {
  return Array.from({ length: count }, (_, i) => createMockCard(`${prefix}_${i}`));
}

describe('GameEngine - QA Checklist Fixes', () => {

  describe('@qa:S02 Life Cards após mulligan', () => {
    it('should keep life_cards empty during setup and distribute only after both players keep hand', () => {
      const p1Deck = generateDeck(50, 'P1_C');
      const p2Deck = generateDeck(50, 'P2_C');
      const p1Leader = createMockLeader('L1', 5);
      const p2Leader = createMockLeader('L2', 4);

      let state = createInitialGameState(p1Deck, p1Leader, p2Deck, p2Leader, 'P1');
      
      // Initially empty
      expect(state.phase).toBe('setup');
      expect(state.players.P1.life_cards.length).toBe(0);
      expect(state.players.P2.life_cards.length).toBe(0);

      // P1 keeps hand
      state = GameEngine.processAction(state, { type: 'SETUP_DECISION', playerId: 'P1', decision: 'KEEP_HAND' });
      expect(state.phase).toBe('setup');
      expect(state.players.P1.life_cards.length).toBe(0);
      expect(state.players.P2.life_cards.length).toBe(0);

      // P2 keeps hand -> advances phase and distributes
      state = GameEngine.processAction(state, { type: 'SETUP_DECISION', playerId: 'P2', decision: 'KEEP_HAND' });
      expect(state.phase).toBe('refresh');
      expect(state.players.P1.life_cards.length).toBe(5);
      expect(state.players.P2.life_cards.length).toBe(4);
      
      // Hand should be 5 for both initially without mulligan
      expect(state.players.P1.hand.length).toBe(5);
      expect(state.players.P2.hand.length).toBe(5);
    });
  });

  describe('@qa:T01 on_leave antes do trash', () => {
    it('should remove the character from the field before executing on_leave', () => {
      const p1Deck = generateDeck(10, 'P1_C');
      const p2Deck = generateDeck(10, 'P2_C');
      const state = createInitialGameState(p1Deck, createMockLeader('L1', 5), p2Deck, createMockLeader('L2', 5), 'P1');
      
      const charToKO = createMockCard('KO_TARGET', 'character', { keywords: ['on_leave'] });
      charToKO.state.location = 'field';
      
      // Add card to field
      state.players.P1.field.characters.push(charToKO);
      
      // Execute KO. We verify the splice inside execute_ko is done before any triggers.
      // Since we don't have effects engine fully mocked, we test state after KO.
      GameEngine.execute_ko(state, 'KO_TARGET', 'P1');
      
      expect(state.players.P1.field.characters.length).toBe(0);
      expect(state.players.P1.trash.length).toBe(1);
      expect(state.players.P1.trash[0].id).toBe('KO_TARGET');
    });

    it('should handle chained on_leave effects successfully without corrupting the state', () => {
      const p1Deck = generateDeck(10, 'P1_C');
      const state = createInitialGameState(p1Deck, createMockLeader('L1', 5), p1Deck, createMockLeader('L2', 5), 'P1');
      
      const char1 = createMockCard('KO_1', 'character', { 
         keywords: ['on_leave'],
         effect: { trigger_condition: 'on_leave', effect_type: 'ko', parameters: { targetId: 'KO_2' } }
      });
      char1.state.location = 'field';
      
      const char2 = createMockCard('KO_2', 'character', { keywords: [] });
      char2.state.location = 'field';
      
      state.players.P1.field.characters.push(char1, char2);
      
      GameEngine.execute_ko(state, 'KO_1', 'P1');
      
      // Both should be in trash, and field should be 0.
      // During execution of char1's on_leave, char1 is already off the field,
      // so targeting char2 works consistently.
      expect(state.players.P1.field.characters.length).toBe(0);
      expect(state.players.P1.trash.length).toBe(2);
      expect(state.players.P1.trash.find(c => c.id === 'KO_1')).toBeDefined();
      expect(state.players.P1.trash.find(c => c.id === 'KO_2')).toBeDefined();
    });
  });

  describe('@qa:T02 Main Phase irreversível', () => {
    it('should ignore main-phase actions after END_MAIN_PHASE has been processed', () => {
      const p1Deck = generateDeck(10, 'P1_C');
      const p2Deck = generateDeck(10, 'P2_C');
      let state = createInitialGameState(p1Deck, createMockLeader('L1', 5), p2Deck, createMockLeader('L2', 5), 'P1');
      
      // Simulate turn 3 (P1's turn)
      state.phase = 'main';
      state.active_player = 'P1';
      state.turn = 3;
      
      const playCardAction = { type: 'PLAY_CARD', cardId: 'P1_C_0', targetPlayerId: 'P1', zoneType: 'character' };
      
      // Advance Phase
      const endPhaseState = GameEngine.processAction(state, { type: 'END_MAIN_PHASE' });
      expect(endPhaseState.phase).toBe('end');
      
      // Attempt to play a card using the state that has advanced to end phase
      // Hand has cards (assuming we placed them correctly or ignoring since game state validation will stop first)
      const invalidActionState = GameEngine.processAction(endPhaseState, playCardAction);
      
      // State should not change to allow playing, the phase remains 'end' and no new action should apply
      expect(invalidActionState.phase).toBe('end');
      // Verify hand size didn't change (still 0 initially in this test but logic stops at phase check)
      expect(invalidActionState).toEqual(endPhaseState);
    });
  });

  describe('@qa:T03 Buffs expiram no End Phase do ativo', () => {
    it('should clear buffs at End Phase of the active player', () => {
      const p1Deck = generateDeck(10, 'P1_C');
      const p2Deck = generateDeck(10, 'P2_C');
      let state = createInitialGameState(p1Deck, createMockLeader('L1', 5), p2Deck, createMockLeader('L2', 5), 'P1');
      
      // Simulate turn 3 (P1's turn)
      state.phase = 'main';
      state.active_player = 'P1';
      state.turn = 3;
      
      const p1Char = createMockCard('P1_CHAR', 'character', { power: 7000, base_power: 5000 });
      state.players.P1.field.characters.push(p1Char);
      
      // P1 advances phase -> should clear P1's buffs
      state = GameEngine.processAction(state, { type: 'END_MAIN_PHASE' });
      expect(state.phase).toBe('end');
      expect(state.players.P1.field.characters[0].power).toBe(5000); // Reset to base_power
      
      // P1 advances end phase -> gets to P2's refresh phase
      state = GameEngine.advancePhase(state);
      expect(state.phase).toBe('refresh');
      expect(state.active_player).toBe('P2');
      expect(state.turn).toBe(4);
      
      // P2's refresh should not crash or improperly alter P1's state
      expect(state.players.P1.field.characters[0].power).toBe(5000);
    });
  });

  describe('Fase 2 - Ataque e Defesa', () => {
    it('@qa:A01 should lock attacker power upon declaration and await defense', () => {
      const state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      const attacker = createMockCard('A1');
      attacker.power = 7000; // Simulated DON buff attached during main phase
      attacker.state.location = 'field';
      state.players.P1.field.characters.push(attacker);
      
      const newState = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'L2' });
      
      expect(newState.attack_context).toBeDefined();
      expect(newState.attack_context?.phase).toBe('AWAITING_DEFENSE');
      expect(newState.attack_context?.attacker_power_final).toBe(7000);
      expect(newState.players.P1.field.characters[0].state.rested).toBe(true);
    });

    it('@qa:A03 should not allow other main phase actions when attack is pending', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      const c = createMockCard('A1');
      state.players.P1.field.characters.push(c);
      
      state = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'L2' });
      expect(state.attack_context).toBeTruthy();
      
      // Attempting to play a card rollback should fail
      const badState = GameEngine.processAction(state, { type: 'PLAY_CARD', cardId: 'P1_0', targetPlayerId: 'P1', zoneType: 'character' });
      expect(badState.players.P1.field.characters.length).toBe(1); // Blocked
    });

    it('@qa:A04 should cancel attack if target is removed before resolution', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      state.players.P1.field.characters.push(createMockCard('A1'));
      const target = createMockCard('T1');
      target.state.rested = true;
      state.players.P2.field.characters.push(target);
      
      const spy = vi.spyOn(GameEngine, 'execute_on_attack').mockImplementation((s: GameState) => {
          // target gets removed mid on_attack execution
          s.players.P2.field.characters.pop();
      });

      const resolvedState = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'T1' });
      
      expect(resolvedState.attack_context).toBeNull(); // Fizzled
      expect(resolvedState.players.P2.trash.length).toBe(0); // Attack fizzles, no battle
      spy.mockRestore();
    });

    it('@qa:A05 should allow attacking rested blockers but not active ones directly', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      state.players.P1.field.characters.push(createMockCard('A1'));
      
      const blocker = createMockCard('B1', 'character', { keywords: ['blocker'] });
      state.players.P2.field.characters.push(blocker);
      
      // Active -> Should ignore declaration
      let badState = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'B1' });
      expect(badState.attack_context).toBeNull();
      
      // Rested -> Allowed
      blocker.state.rested = true;
      let okState = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'B1' });
      expect(okState.attack_context).toBeDefined();
    });

    it('@qa:A06 should handle exact singular defense step (Blocker or Counter)', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      state.players.P1.field.characters.push(createMockCard('A1', 'character', { power: 5000 }));
      state.players.P2.field.characters.push(createMockCard('T1', 'character', { power: 4000 }));
      state.players.P2.field.characters[0].state.rested = true; // Make targetable
      state.players.P2.hand.push(createMockCard('C1', 'character', { counter: 2000 })); // counter
      
      state = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'T1' });
      
      // Option 1: Use Counter
      const pCounter = GameEngine.processAction(state, { type: 'DEFENSE_DECISION', playerId: 'P2', decision: 'USE_COUNTER', cardIds: ['C1'] });
      expect(pCounter.attack_context).toBeNull(); // Closed successfully
      // T1 survives because 5000 <= 4000 + 2000
      expect(pCounter.players.P2.trash.length).toBe(1); // Only C1 should be inside trash
      expect(pCounter.players.P2.trash[0].id).toBe('C1');
      expect(pCounter.players.P2.field.characters.length).toBe(1); // T1 survived
    });

    it('@qa:A02 should trigger on_leave correctly when blocker is K.O.d', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      state.players.P1.field.characters.push(createMockCard('A1', 'character', { power: 6000 }));
      
      const blocker = createMockCard('B1', 'character', { keywords: ['blocker', 'on_leave'] });
      blocker.power = 3000;
      state.players.P2.field.characters.push(blocker);
      
      state.players.P2.field.characters[0].state.rested = false; // Must be active to test block
      state.players.P2.leader!.state.rested = false;
      
      state = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'L2' });
      
      const resolved = GameEngine.processAction(state, { type: 'DEFENSE_DECISION', playerId: 'P2', decision: 'USE_BLOCKER', blockerId: 'B1' });
      
      expect(resolved.attack_context).toBeNull();
      expect(resolved.players.P2.field.characters.length).toBe(0);
      expect(resolved.players.P2.trash.length).toBe(1);
      expect(resolved.players.P2.trash[0].id).toBe('B1');
    });

  });

  describe('Fase 3 - Efeitos e Keywords', () => {
    it('@qa:E01 should process effects using a LIFO stack', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      
      const charA = createMockCard('A', 'character');
      const charB = createMockCard('B', 'character');
      state.players.P2.field.characters.push(charA, charB);
      
      state.effect_stack.push({
          sourceId: 'src1',
          playerId: 'P1',
          effect: { trigger_condition: 'on_play', effect_type: 'ko', parameters: {} },
          targetId: 'A'
      });
      state.effect_stack.push({
          sourceId: 'src2',
          playerId: 'P1',
          effect: { trigger_condition: 'on_play', effect_type: 'ko', parameters: {} },
          targetId: 'B'
      });
      
      const order: string[] = [];
      const spy = vi.spyOn(GameEngine, 'execute_ko').mockImplementation((_s, targetId) => {
         order.push(targetId);
      });
      
      GameEngine.resolveNextEffect(state);
      
      expect(order).toEqual(['B', 'A']); // LIFO
      spy.mockRestore();
    });

    it('@qa:E02 should resolve direct KO on the chosen opponent character without any defense window', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      state.players.P2.field.characters.push(createMockCard('TARGET_A'), createMockCard('TARGET_B'));

      state.effect_stack.push({
        sourceId: 'src1',
        playerId: 'P1',
        effect: { trigger_condition: 'on_play', effect_type: 'ko', parameters: {} },
        targetId: 'TARGET_B'
      });

      const resolved = GameEngine.resolveNextEffect(state);

      expect(resolved.attack_context).toBeNull();
      expect(resolved.players.P2.field.characters.find(c => c.id === 'TARGET_A')).toBeDefined();
      expect(resolved.players.P2.field.characters.find(c => c.id === 'TARGET_B')).toBeUndefined();
      expect(resolved.players.P2.trash.find(c => c.id === 'TARGET_B')).toBeDefined();
    });

    it('@qa:E03 should move searched cards to the controller hand without exposing content to the opponent view', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      const searchedCard = createMockCard('SEARCH_TARGET', 'character', { card_number: 'SEARCH-001', name: 'Secret Search Hit' });
      state.players.P1.deck = [createMockCard('FILLER_1'), searchedCard, createMockCard('FILLER_2')];

      state.effect_stack.push({
        sourceId: 'src1',
        playerId: 'P1',
        effect: { trigger_condition: 'on_play', effect_type: 'search', parameters: { card_number: 'SEARCH-001' } }
      });

      const resolved = GameEngine.resolveNextEffect(state);
      const selfView = GameEngine.serializeForPlayer(resolved, 'P1');
      const opponentView = GameEngine.serializeForPlayer(resolved, 'P2');

      expect(resolved.players.P1.hand.find(c => c.id === 'SEARCH_TARGET')).toBeDefined();
      expect(selfView.players.P1.hand).toEqual(resolved.players.P1.hand);
      expect(opponentView.players.P1.hand).toEqual({ count: resolved.players.P1.hand.length });
    });

    it('@qa:E04 should discard up to hand length without throwing error', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.players.P1.hand = [createMockCard('C1')];

      state.effect_stack.push({
          sourceId: 'src1',
          playerId: 'P1',
          effect: { trigger_condition: 'on_play', effect_type: 'discard', parameters: { amount: 3 } }
      });
      
      const resolved = GameEngine.resolveNextEffect(state);
      expect(resolved.players.P1.hand.length).toBe(0);
      expect(resolved.players.P1.trash.length).toBe(1);
    });

    it('@qa:E05 should restrict activate_main to once per turn', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      const c = createMockCard('C1', 'character', { keywords: ['activate_main'], effect: { trigger_condition: 'activate_main', effect_type: 'draw', parameters: {} } });
      state.players.P1.field.characters.push(c);

      const action = { type: 'ACTIVATE_MAIN', playerId: 'P1', cardId: 'C1' };
      
      let s1 = GameEngine.processAction(state, action);
      expect(s1.players.P1.field.characters[0].state.activate_main_used).toBe(true);

      let s2 = GameEngine.processAction(s1, action);
      expect(s2).toEqual(s1); // Bloqueado
    });

    it('@qa:E06 should reject invalid counter cards during defense phase', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      state.players.P1.field.characters.push(createMockCard('A1', 'character', { power: 5000 }));
      state.players.P2.field.characters.push(createMockCard('T1', 'character', { power: 4000 }));
      state.players.P2.field.characters[0].state.rested = true;
      
      const badCounter = createMockCard('C1', 'character', { counter: null });
      state.players.P2.hand.push(badCounter);
      
      state = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'T1' });
      
      const resolved = GameEngine.processAction(state, { type: 'DEFENSE_DECISION', playerId: 'P2', decision: 'USE_COUNTER', cardIds: ['C1'] });
      
      expect(resolved.attack_context).toBeNull();
      // Counter nulo nao entra
      expect(resolved.players.P2.trash[0].id).toBe('T1'); // T1 morre
    });

    it('@qa:C04 should put attacked Life Card into removed location if attacker has banish', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      const c = createMockCard('A1', 'character', { keywords: ['banish'], power: 5000 });
      state.players.P1.field.characters.push(c);
      
      state.players.P2.leader!.power = 4000;
      state.players.P2.life_cards.push(createMockCard('L1_Life'));

      state = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'L2' });
      const resolved = GameEngine.processAction(state, { type: 'DEFENSE_DECISION', playerId: 'P2', decision: 'NO_DEFENSE' });
      
      expect(resolved.players.P2.hand.length).toBe(5);
      expect(resolved.players.P2.trash.length).toBe(1);
      expect(resolved.players.P2.trash[0].state.location).toBe('removed');
    });

    it('@qa:C05 should allow attacking after rested once if character has double_attack flag', () => {
      let state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      const c = createMockCard('A1', 'character', { keywords: ['double_attack'], power: 5000 });
      state.players.P1.field.characters.push(c);
      state.players.P2.leader!.power = 4000;
      state.players.P2.life_cards.push(createMockCard('P2_LIFE_1'));

      state = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'L2' });
      state = GameEngine.processAction(state, { type: 'DEFENSE_DECISION', playerId: 'P2', decision: 'NO_DEFENSE' });
      
      expect(state.players.P1.field.characters[0].state.double_attack_second_pending).toBe(true);
      expect(state.players.P1.field.characters[0].state.rested).toBe(true);

      state = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'L2' });
      expect(state.attack_context).toBeDefined();
      expect(state.players.P1.field.characters[0].state.double_attack_second_pending).toBe(false);
    });
  });

  describe('Fase 4 - Triggers, Vitória e Edge Cases', () => {
    it('@qa:L01 should resolve chained life triggers through FIFO queue until the chain ends', () => {
      const state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';

      const attacker = createMockCard('A1', 'character', { power: 6000 });
      state.players.P1.field.characters.push(attacker);
      state.players.P2.leader!.power = 5000;

      state.players.P2.life_cards = [
        createMockCard('P2_LIFE_1', 'event', {
          trigger: { trigger_condition: 'trigger', effect_type: 'life_damage', parameters: { targetPlayerId: 'P1', amount: 1 } }
        })
      ];
      state.players.P1.life_cards = [
        createMockCard('P1_LIFE_1', 'event', {
          trigger: { trigger_condition: 'trigger', effect_type: 'draw', parameters: { amount: 1 } }
        })
      ];
      state.players.P1.deck = [createMockCard('P1_TOPDECK')];

      const declared = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'L2' });
      const resolved = GameEngine.processAction(declared, { type: 'DEFENSE_DECISION', playerId: 'P2', decision: 'NO_DEFENSE' });

      expect(resolved.attack_context).toBeNull();
      expect(resolved.players.P2.life_cards.length).toBe(0);
      expect(resolved.players.P1.life_cards.length).toBe(0);
      expect(resolved.players.P1.hand.find(c => c.id === 'P1_TOPDECK')).toBeDefined();
      expect(resolved.trigger_queue.length).toBe(0);
    });

    it('@qa:L02 should resolve a life trigger automatically without waiting for player input', () => {
      const state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';

      state.players.P1.field.characters.push(createMockCard('A1', 'character', { power: 6000 }));
      state.players.P2.leader!.power = 5000;
      state.players.P2.life_cards = [
        createMockCard('P2_LIFE_TRIGGER', 'event', {
          trigger: { trigger_condition: 'trigger', effect_type: 'draw', parameters: { amount: 1 } }
        })
      ];
      state.players.P2.deck = [createMockCard('P2_TOPDECK')];

      const declared = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'L2' });
      const resolved = GameEngine.processAction(declared, { type: 'DEFENSE_DECISION', playerId: 'P2', decision: 'NO_DEFENSE' });

      expect(resolved.players.P2.hand.find(c => c.id === 'P2_LIFE_TRIGGER')).toBeDefined();
      expect(resolved.players.P2.hand.find(c => c.id === 'P2_TOPDECK')).toBeDefined();
      expect(resolved.trigger_queue.length).toBe(0);
    });

    it('@qa:L03 should resolve trigger-played blockers only after the attack is fully over', () => {
      const state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';

      state.players.P1.field.characters.push(createMockCard('A1', 'character', { power: 6000 }));
      state.players.P2.leader!.power = 5000;
      state.players.P2.life_cards = [
        createMockCard('P2_LIFE_BLOCKER', 'event', {
          trigger: {
            trigger_condition: 'trigger',
            effect_type: 'play_character',
            parameters: {
              card: createMockCard('NEW_BLOCKER', 'character', { keywords: ['blocker'], power: 1000 })
            }
          }
        })
      ];

      const declared = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'L2' });
      const resolved = GameEngine.processAction(declared, { type: 'DEFENSE_DECISION', playerId: 'P2', decision: 'NO_DEFENSE' });

      expect(resolved.attack_context).toBeNull();
      expect(resolved.players.P2.field.characters.find(c => c.id === 'NEW_BLOCKER')).toBeDefined();
    });

    it('@qa:C01 should reject playing a sixth character before paying DON cost', () => {
      const state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      state.players.P1.field.characters = Array.from({ length: 5 }, (_, i) => createMockCard(`FIELD_${i}`));
      state.players.P1.hand = [createMockCard('HAND_CHAR', 'character', { cost: 1 })];
      state.players.P1.cost_area = [createMockCard('DON_1', 'don', { state: { rested: false, location: 'cost_area' } })];

      const resolved = GameEngine.processAction(state, { type: 'PLAY_CARD', cardId: 'HAND_CHAR', targetPlayerId: 'P1', zoneType: 'character' });

      expect(resolved.players.P1.field.characters).toHaveLength(5);
      expect(resolved.players.P1.hand.find(c => c.id === 'HAND_CHAR')).toBeDefined();
      expect(resolved.players.P1.cost_area[0].state.rested).toBe(false);
    });

    it('@qa:C02 should immediately lose on draw phase when the active player has no deck', () => {
      const state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'refresh';
      state.active_player = 'P1';
      state.players.P1.deck = [];
      state.players.P1.life_cards = [createMockCard('P1_LIFE')];

      const resolved = GameEngine.advancePhase(state);

      expect(resolved.status).toBe('finished');
      expect(resolved.winner).toBe('P2');
    });

    it('@qa:C03 should allow a rush character to attack without any DON boost after being played', () => {
      const state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      state.turn = 1;
      state.players.P1.cost_area = [createMockCard('DON_1', 'don', { state: { rested: false, location: 'cost_area' } })];
      state.players.P1.hand = [createMockCard('RUSHER', 'character', { cost: 1, keywords: ['rush'], power: 5000 })];
      state.players.P2.leader!.power = 4000;

      const afterPlay = GameEngine.processAction(state, { type: 'PLAY_CARD', cardId: 'RUSHER', targetPlayerId: 'P1', zoneType: 'character' });
      const afterAttack = GameEngine.processAction(afterPlay, { type: 'DECLARE_ATTACK', attackerId: 'RUSHER', targetId: 'L2' });

      expect(afterPlay.players.P1.cost_area.filter(d => !d.state.rested)).toHaveLength(0);
      expect(afterAttack.attack_context?.attacker_power_final).toBe(5000);
    });

    it('@qa:V01 should honor the first win condition detected in execution order', () => {
      const state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.phase = 'main';
      state.players.P1.field.characters.push(createMockCard('A1', 'character', { power: 6000 }));
      state.players.P2.leader!.power = 5000;
      state.players.P2.life_cards = [];
      state.players.P2.deck = [];

      const declared = GameEngine.processAction(state, { type: 'DECLARE_ATTACK', attackerId: 'A1', targetId: 'L2' });
      const resolved = GameEngine.processAction(declared, { type: 'DEFENSE_DECISION', playerId: 'P2', decision: 'NO_DEFENSE' });

      expect(resolved.status).toBe('finished');
      expect(resolved.winner).toBe('P1');
    });

    it('@qa:V02 should stop resolving the remaining chain as soon as a win condition is met', () => {
      const state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.effect_stack.push({
        sourceId: 'SRC',
        playerId: 'P1',
        effect: { trigger_condition: 'on_play', effect_type: 'draw', parameters: { amount: 1 } }
      });
      state.effect_stack.push({
        sourceId: 'SRC',
        playerId: 'P1',
        effect: { trigger_condition: 'on_play', effect_type: 'life_damage', parameters: { targetPlayerId: 'P2', amount: 1 } }
      });
      state.players.P2.life_cards = [];
      state.players.P1.deck = [createMockCard('P1_DRAW_SHOULD_NOT_HAPPEN')];

      const resolved = GameEngine.resolveNextEffect(state);

      expect(resolved.status).toBe('finished');
      expect(resolved.winner).toBe('P1');
      expect(resolved.players.P1.hand.find(c => c.id === 'P1_DRAW_SHOULD_NOT_HAPPEN')).toBeUndefined();
    });

    it('@qa:V03 should ignore any further actions after the game is finished mid-phase', () => {
      const state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.status = 'finished';
      state.winner = 'P1';
      state.phase = 'main';
      state.players.P1.hand = [createMockCard('HAND_CHAR', 'character', { cost: 0 })];

      const resolved = GameEngine.processAction(state, { type: 'PLAY_CARD', cardId: 'HAND_CHAR', targetPlayerId: 'P1', zoneType: 'character' });

      expect(resolved).toEqual(state);
    });

    it('@qa:C06 should allow hands to grow without any end-phase discard limit', () => {
      const state = createInitialGameState(generateDeck(20, 'P1'), createMockLeader('L1', 5), generateDeck(20, 'P2'), createMockLeader('L2', 5), 'P1');
      state.players.P1.hand = Array.from({ length: 12 }, (_, i) => createMockCard(`HAND_${i}`));
      state.phase = 'main';
      state.active_player = 'P1';

      const resolved = GameEngine.processAction(state, { type: 'END_MAIN_PHASE' });

      expect(resolved.phase).toBe('end');
      expect(resolved.players.P1.hand).toHaveLength(12);
    });
  });

  describe('Fase 5 - IA e Serializacao', () => {
    it('@qa:I01 should hide both players life card contents and only expose opponent hand count', () => {
      const state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      state.players.P1.hand = [createMockCard('P1_HAND')];
      state.players.P2.hand = [createMockCard('P2_HAND_1'), createMockCard('P2_HAND_2')];
      state.players.P1.life_cards = [createMockCard('P1_LIFE')];
      state.players.P2.life_cards = [createMockCard('P2_LIFE')];

      const view = GameEngine.serializeForPlayer(state, 'P1');

      expect(Array.isArray(view.players.P1.hand)).toBe(true);
      expect(view.players.P1.life_cards.cards).toEqual([{ hidden: true }]);
      expect(view.players.P2.hand).toEqual({ count: 2 });
      expect(view.players.P2.life_cards.cards).toEqual([{ hidden: true }]);
    });

    it('@qa:I02 should produce the same initial setup when the same seed is used', () => {
      const deckA = generateDeck(10, 'P1');
      const deckB = generateDeck(10, 'P2');

      const state1 = createInitialGameState(deckA, createMockLeader('L1', 5), deckB, createMockLeader('L2', 5), 'P1', { seed: 42 });
      const state2 = createInitialGameState(deckA, createMockLeader('L1', 5), deckB, createMockLeader('L2', 5), 'P1', { seed: 42 });

      expect(state1.seed).toBe(42);
      expect(state1.players.P1.hand.map(c => c.id)).toEqual(state2.players.P1.hand.map(c => c.id));
      expect(state1.players.P2.deck.map(c => c.id)).toEqual(state2.players.P2.deck.map(c => c.id));
    });

    it('@qa:I03 should expose opponent decklist only when open_decklist is enabled', () => {
      const stateClosed = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');
      const stateOpen = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1', { open_decklist: true });

      const closedView = GameEngine.serializeForPlayer(stateClosed, 'P1');
      const openView = GameEngine.serializeForPlayer(stateOpen, 'P1');

      expect(closedView.players.P2.deck.known_cards).toBeUndefined();
      expect(openView.players.P2.deck.known_cards?.length).toBe(stateOpen.players.P2.deck.length);
    });

    it('@qa:I04 should wait for both mulligan decisions before leaving setup', () => {
      const state = createInitialGameState(generateDeck(10, 'P1'), createMockLeader('L1', 5), generateDeck(10, 'P2'), createMockLeader('L2', 5), 'P1');

      const afterP1 = GameEngine.processAction(state, { type: 'SETUP_DECISION', playerId: 'P1', decision: 'MULLIGAN' });

      expect(afterP1.phase).toBe('setup');
      expect(afterP1.waiting_for).toEqual({ type: 'SETUP_DECISION', p1_ready: true, p2_ready: false });
      expect(afterP1.players.P2.life_cards).toHaveLength(0);
      expect(afterP1.players.P1.life_cards).toHaveLength(0);
    });
  });
});
