import type {
  GameInitOptions,
  GameState,
  PlayerId,
  Card,
  PlayerState,
  SerializedGameState,
  SerializedPlayerView
} from '../types/game';

// Factory helpers
function createInitialDonDeck(): Card[] {
  return Array(10).fill(null).map((_, i) => ({
    id: `don_${i}`,
    card_number: 'DON-001',
    type: 'don',
    color: [],
    cost: 0,
    power: 0,
    base_power: 0,
    counter: null,
    keywords: [],
    trigger: null,
    effect: null,
    state: { rested: false, location: 'don_deck' },
    name: 'DON!!'
  }));
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleArray<T>(array: T[], randomFn: () => number = Math.random): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createInitialGameState(
  p1Deck: Card[],
  p1Leader: Card,
  p2Deck: Card[],
  p2Leader: Card,
  firstPlayerId: PlayerId,
  options: GameInitOptions = {}
): GameState {
  if (!firstPlayerId) throw new Error("firstPlayerId must be explicitly provided");
  const randomFn = options.seed !== undefined ? createSeededRandom(options.seed) : Math.random;
  const preparedP1Deck = shuffleArray(p1Deck, randomFn);
  const preparedP2Deck = shuffleArray(p2Deck, randomFn);
  const p1: PlayerState = {
    id: 'P1',
    mulligan_used: false,
    leader: p1Leader as any,
    hand: preparedP1Deck.slice(0, 5).map(c => ({ ...c, state: { rested: false, location: 'hand' } })),
    deck: preparedP1Deck.slice(5).map(c => ({ ...c, state: { rested: false, location: 'deck' } })),
    trash: [],
    field: { characters: [], stage: null },
    don_deck: shuffleArray(createInitialDonDeck(), randomFn),
    cost_area: [],
    don_given: [],
    life_cards: [], // S02: Life cards are drawn AFTER mulligan
  };

  const p2: PlayerState = {
    id: 'P2',
    mulligan_used: false,
    leader: p2Leader as any,
    hand: preparedP2Deck.slice(0, 5).map(c => ({ ...c, state: { rested: false, location: 'hand' } })),
    deck: preparedP2Deck.slice(5).map(c => ({ ...c, state: { rested: false, location: 'deck' } })),
    trash: [],
    field: { characters: [], stage: null },
    don_deck: shuffleArray(createInitialDonDeck(), randomFn),
    cost_area: [],
    don_given: [],
    life_cards: [], // S02: Life cards are drawn AFTER mulligan
  };

  return {
    turn: 1,
    first_player: firstPlayerId,
    active_player: firstPlayerId, // S03: accept input parameter
    seed: options.seed ?? null,
    open_decklist: options.open_decklist ?? false,
    phase: 'setup',
    players: { P1: p1, P2: p2 },
    waiting_for: { type: 'SETUP_DECISION', p1_ready: false, p2_ready: false },
    attack_context: null,
    effect_stack: [],
    trigger_queue: [],
    status: 'playing',
    winner: null
  };
}

export class GameEngine {
  static triggerWinCondition(state: GameState, winner: PlayerId): GameState {
    state.status = 'finished';
    state.winner = winner;
    state.attack_context = null;
    state.waiting_for = null;
    state.effect_stack = [];
    state.trigger_queue = [];
    return state;
  }

  static getOpponentId(playerId: PlayerId): PlayerId {
    return playerId === 'P1' ? 'P2' : 'P1';
  }

  static isFinished(state: GameState): boolean {
    return state.status === 'finished';
  }

  static resolvePendingEffect(state: GameState, pending: any): GameState {
    if (this.isFinished(state)) return state;

    const playerId = pending.playerId as PlayerId;
    const p = state.players[playerId];
    const opId = this.getOpponentId(playerId);

    if (pending.effect.effect_type === 'discard') {
      const requested = pending.effect.parameters.amount || 1;
      const amount = Math.min(requested, p.hand.length);
      for (let i = 0; i < amount; i++) {
        const discarded = p.hand.shift()!;
        discarded.state.location = 'trash';
        p.trash.push(discarded);
      }
    } else if (pending.effect.effect_type === 'ko') {
      if (pending.targetId) {
        this.execute_ko(state, pending.targetId, opId);
      }
    } else if (pending.effect.effect_type === 'draw') {
      const amount = pending.effect.parameters.amount ?? 1;
      for (let i = 0; i < amount; i++) {
        if (p.deck.length === 0) {
          return this.triggerWinCondition(state, opId);
        }

        const drawn = p.deck.shift()!;
        drawn.state.location = 'hand';
        p.hand.push(drawn);
      }
    } else if (pending.effect.effect_type === 'search') {
      const targetCardId = pending.effect.parameters.cardId as string | undefined;
      const targetCardNumber = pending.effect.parameters.card_number as string | undefined;
      const matchIndex = p.deck.findIndex((card) => {
        if (targetCardId) return card.id === targetCardId;
        if (targetCardNumber) return card.card_number === targetCardNumber;
        return true;
      });

      if (matchIndex !== -1) {
        const [foundCard] = p.deck.splice(matchIndex, 1);
        foundCard.state.location = 'hand';
        p.hand.push(foundCard);
      }
    } else if (pending.effect.effect_type === 'life_damage') {
      const targetPlayerId = (pending.effect.parameters.targetPlayerId ?? opId) as PlayerId;
      const amount = pending.effect.parameters.amount ?? 1;
      const source = this.findCard(state, pending.sourceId, pending.playerId);

      for (let i = 0; i < amount; i++) {
        this.executeLifeDamage(state, targetPlayerId, source ?? undefined);
        if (this.isFinished(state)) return state;
      }

      return this.resolveTriggerQueue(state);
    } else if (pending.effect.effect_type === 'play_character') {
      const targetPlayerId = (pending.effect.parameters.targetPlayerId ?? playerId) as PlayerId;
      const player = state.players[targetPlayerId];

      if (player.field.characters.length >= 5) {
        return state;
      }

      const cardToPlay = pending.effect.parameters.card as Card | undefined;
      if (!cardToPlay || cardToPlay.type !== 'character') {
        return state;
      }

      const nextCard = structuredClone(cardToPlay);
      nextCard.state = { ...nextCard.state, rested: false, location: 'field' };
      player.field.characters.push(nextCard);
    }

    return state;
  }

  static resolveTriggerQueue(state: GameState): GameState {
    while (state.trigger_queue.length > 0 && !this.isFinished(state)) {
      const pending = state.trigger_queue.shift()!;
      this.resolvePendingEffect(state, pending);
    }

    return state;
  }

  static executeLifeDamage(state: GameState, defenderId: PlayerId, source?: Card): GameState {
    if (this.isFinished(state)) return state;

    const defender = state.players[defenderId];
    if (defender.life_cards.length === 0) {
      return this.triggerWinCondition(state, this.getOpponentId(defenderId));
    }

    const lifeCard = defender.life_cards.shift()!;
    const isBanished = Boolean(source?.keywords.includes('banish'));

    if (isBanished) {
      lifeCard.state.location = 'removed';
      defender.trash.push(lifeCard);
      return state;
    }

    lifeCard.state.location = 'hand';
    defender.hand.push(lifeCard);

    if (lifeCard.trigger) {
      state.trigger_queue.push({
        sourceId: lifeCard.id,
        effect: lifeCard.trigger,
        playerId: defenderId
      });
    }

    return state;
  }

  static findCard(state: GameState, cardId: string, playerId: PlayerId): Card | null {
    const player = state.players[playerId];
    if (player.leader?.id === cardId) return player.leader;
    return player.field.characters.find((card) => card.id === cardId) ?? null;
  }

  static serializeForPlayer(state: GameState, viewerId: PlayerId): SerializedGameState {
    const serializeLife = (player: PlayerState) => ({
      count: player.life_cards.length,
      cards: player.life_cards.map(() => ({ hidden: true as const }))
    });

    const serializePlayer = (player: PlayerState, perspective: PlayerId): SerializedPlayerView => {
      const isSelf = player.id === perspective;
      return {
        id: player.id,
        leader: player.leader,
        hand: isSelf ? structuredClone(player.hand) : { count: player.hand.length },
        deck: {
          count: player.deck.length,
          known_cards: !isSelf && state.open_decklist ? structuredClone(player.deck.map((card) => ({ ...card }))) : undefined
        },
        trash: structuredClone(player.trash),
        field: structuredClone(player.field),
        don_deck: { count: player.don_deck.length },
        cost_area: structuredClone(player.cost_area),
        don_given: structuredClone(player.don_given),
        life_cards: serializeLife(player)
      };
    };

    return {
      turn: state.turn,
      first_player: state.first_player,
      active_player: state.active_player,
      phase: state.phase,
      status: state.status,
      winner: state.winner,
      open_decklist: state.open_decklist,
      players: {
        P1: serializePlayer(state.players.P1, viewerId),
        P2: serializePlayer(state.players.P2, viewerId)
      }
    };
  }
  
  static processAction(state: GameState, action: any): GameState {
    if (this.isFinished(state)) return state;
    if (state.phase === 'setup') {
        return this.processSetupAction(state, action);
    }
    
    // A03: Reject main phase actions if an attack is in progress
    if (state.attack_context) {
        if (action.type !== 'DEFENSE_DECISION') return state;
        return this.processDefenseDecision(state, action);
    }
    
    if (action.type === 'DECLARE_ATTACK') {
      return this.declareAttack(state, action);
    } else if (action.type === 'ACTIVATE_MAIN') {
      return this.activateMain(state, action);
    } else if (action.type === 'PLAY_CARD') {
      return this.playCard(state, action);
    } else if (action.type === 'GIVE_DON') {
      return this.giveDon(state, action);
    } else if (action.type === 'END_MAIN_PHASE') {
      // T02: explicit advancement
      if (state.phase === 'main') {
          return this.advancePhase(state);
      }
    }
    return state;
  }

  static processSetupAction(state: GameState, action: any): GameState {
    if (this.isFinished(state)) return state;
    const newState = structuredClone(state);
    const { playerId, decision } = action; // decision: 'MULLIGAN' | 'KEEP_HAND'
    
    // Safety check that gameplay is still in setup
    if (newState.phase !== 'setup' || !newState.waiting_for) return state;

    const p = newState.players[playerId as PlayerId];
    if (!p) return state;

    if (decision === 'MULLIGAN') {
      // S01: check if already used
      if (p.mulligan_used) return state;
      
      // Reshuffle hand into deck
      p.hand.forEach(c => {
         c.state.location = 'deck';
         p.deck.push(c);
      });
      p.hand = [];
      p.deck = shuffleArray(p.deck);
      
      // Draw 5 new cards
      for(let i = 0; i < 5; i++) {
         if (p.deck.length > 0) {
            const card = p.deck.shift()!;
            card.state.location = 'hand';
            p.hand.push(card);
         }
      }
      p.mulligan_used = true;
      // Mark player as ready because you can only mulligan once
      if (playerId === 'P1') newState.waiting_for.p1_ready = true;
      else if (playerId === 'P2') newState.waiting_for.p2_ready = true;
    } else if (decision === 'KEEP_HAND') {
      if (playerId === 'P1') newState.waiting_for.p1_ready = true;
      else if (playerId === 'P2') newState.waiting_for.p2_ready = true;
    }

    // Check if both players are ready to proceed
    if (newState.waiting_for.p1_ready && newState.waiting_for.p2_ready) {
      // End setup: draw life cards
      ['P1', 'P2'].forEach(id => {
         const player = newState.players[id as PlayerId];
         if (player.leader) {
             const lifeCount = player.leader.life;
             for (let i = 0; i < lifeCount; i++) {
                 if (player.deck.length > 0) {
                     const card = player.deck.shift()!;
                     card.state.location = 'life';
                     player.life_cards.push(card);
                 }
             }
         }
      });
      
      newState.phase = 'refresh';
      newState.waiting_for = null;
    }

    return newState;
  }

  static declareAttack(state: GameState, action: any): GameState {
    if (this.isFinished(state)) return state;
    const newState = structuredClone(state);
    if (newState.phase !== 'main') return state;

    const { attackerId, targetId } = action;
    const p = newState.players[newState.active_player];
    
    // Find attacker
    let attacker = p.leader?.id === attackerId ? p.leader : p.field.characters.find(c => c.id === attackerId);
    if (!attacker) return state; 
    
    const canAttack = !attacker.state.rested || attacker.state.double_attack_second_pending;
    if (!canAttack) return state;
    
    // Find target
    const opponentId = newState.active_player === 'P1' ? 'P2' : 'P1';
    const op = newState.players[opponentId];
    let target = op.leader?.id === targetId ? op.leader : op.field.characters.find(c => c.id === targetId);

    if (!target) return state;
    
    // A05: You can attack rested characters or the leader (or blockers if they are rested). 
    // Active characters cannot be targetted unless an effect says so. 
    if (target.type === 'character' && !target.state.rested) {
        return state;
    }

    // A03: Irreversible
    attacker.state.rested = true; 
    
    // C05: If using double attack second time, clear the flag
    if (attacker.state.double_attack_second_pending) {
        attacker.state.double_attack_second_pending = false;
    }
    
    // A01: attacker final power is fixed
    newState.attack_context = {
        attacker_id: attackerId,
        target_id: targetId,
        attacker_power_final: attacker.power,
        target_power_bonus: 0,
        phase: 'AWAITING_DEFENSE'
    };
    
    // Process on_attack
    this.execute_on_attack(newState, attackerId);
    
    // A04: if target disappears during on_attack, fizzle attack before defense
    const stillExists = op.leader?.id === targetId ? op.leader : op.field.characters.find(c => c.id === targetId);
    if (!stillExists) {
        newState.attack_context = null;
    }
    
    return newState;
  }

  static execute_on_attack(_state: GameState, _attackerId: string) {
    // Hook for on_attack effects implementation
  }

  static processDefenseDecision(state: GameState, action: any): GameState {
    if (this.isFinished(state)) return state;
    const newState = structuredClone(state);
    const ctx = newState.attack_context;
    if (!ctx || ctx.phase !== 'AWAITING_DEFENSE') return state;

    const defenderId = newState.active_player === 'P1' ? 'P2' : 'P1';
    const defPlayer = newState.players[defenderId];
    if (action.playerId !== defenderId) return state;

    const { decision, cardIds, blockerId } = action; // decision: 'USE_BLOCKER' | 'USE_COUNTER' | 'NO_DEFENSE'
    
    if (decision === 'USE_BLOCKER' && blockerId) {
        const blocker = defPlayer.field.characters.find(c => c.id === blockerId);
        if (!blocker || blocker.state.rested || !blocker.keywords.includes('blocker')) return state;
        
        blocker.state.rested = true;
        ctx.target_id = blocker.id;
    } else if (decision === 'USE_COUNTER' && cardIds) {
        for (const cid of cardIds) {
            const hIdx = defPlayer.hand.findIndex(c => c.id === cid);
            if (hIdx !== -1) {
                const ccard = defPlayer.hand[hIdx];
                // E06: Ensure it's a valid counter card
                if (ccard.counter && ccard.counter > 0) {
                    ctx.target_power_bonus += ccard.counter;
                    ccard.state.location = 'trash';
                    defPlayer.trash.push(ccard);
                }
                defPlayer.hand.splice(hIdx, 1);
            }
        }
    } else if (decision !== 'NO_DEFENSE') {
        return state; // invalid
    }

    ctx.phase = 'RESOLVING';
    return this.resolveAttack(newState);
  }

  static resolveAttack(state: GameState): GameState {
    if (this.isFinished(state)) return state;
    const ctx = state.attack_context;
    if (!ctx || ctx.phase !== 'RESOLVING') return state;
    
    const defenderId = state.active_player === 'P1' ? 'P2' : 'P1';
    const defP = state.players[defenderId];
    
    let target = defP.leader?.id === ctx.target_id ? defP.leader : defP.field.characters.find(c => c.id === ctx.target_id);
    
    if (!target) {
        // Target disappeared before resolution (e.g. A04 on_attack)
        state.attack_context = null;
        return state;
    }
    
    const attackerPower = ctx.attacker_power_final;
    const targetPower = target.power + ctx.target_power_bonus;
    
    // Resolve attacker for keywords
    let attacker = state.players[state.active_player].leader?.id === ctx.attacker_id ? state.players[state.active_player].leader : state.players[state.active_player].field.characters.find(c => c.id === ctx.attacker_id);
    
    if (attackerPower >= targetPower) {
        if (target.type === 'leader') {
            this.executeLifeDamage(state, defenderId, attacker ?? undefined);
        } else {
            this.execute_ko(state, target.id, defenderId); // A02: handles on_leave internally
        }
    }
    
    // C05: Double Attack - enable second attack if not already used
    if (attacker && attacker.keywords.includes('double_attack') && !attacker.state.double_attack_second_pending) {
        // Here we'd verify if it's actually their first attack of the turn, but usually we just grant the pending flag 
        // We assume any Double Attack capable character gets the flag once 
        attacker.state.double_attack_second_pending = true;
    }
    
    state.attack_context = null;
    return this.resolveTriggerQueue(state);
  }

  static activateMain(state: GameState, action: any): GameState {
    if (this.isFinished(state)) return state;
    const newState = structuredClone(state);
    if (newState.phase !== 'main') return state;
    if (newState.active_player !== action.playerId) return state;

    const p = newState.players[newState.active_player];
    const card = p.field.characters.find(c => c.id === action.cardId) || (p.leader?.id === action.cardId ? p.leader : null);
    
    if (!card) return state;
    if (card.state.activate_main_used) return state;
    if (!card.keywords.includes('activate_main') && card.effect?.trigger_condition !== 'activate_main') return state;
    
    // E05: Restrict to once per turn
    card.state.activate_main_used = true;
    
    if (card.effect) {
        // E01: Push to LIFO
        newState.effect_stack.push({
            sourceId: card.id,
            effect: card.effect,
            playerId: newState.active_player,
            targetId: action.targetId
        });
        
        return this.resolveNextEffect(newState);
    }
    
    return newState;
  }

  static resolveNextEffect(state: GameState): GameState {
     if (this.isFinished(state)) return state;

     while (state.effect_stack.length > 0 && !this.isFinished(state)) {
         const pending = state.effect_stack.pop()!;
         this.resolvePendingEffect(state, pending);
     }

     return state;
  }

  static playCard(state: GameState, action: any): GameState {
    if (this.isFinished(state)) return state;
    const newState = structuredClone(state);
    
    // Somente na fase main (regra core)
    if (newState.phase !== 'main') return state;

    const { cardId, targetPlayerId, zoneType } = action;
    
    // Jogador ativo só pode dropar pros próprios slots
    if (newState.active_player !== targetPlayerId) return state;

    const p = newState.players[newState.active_player];
    
    // Checar se a carta está na mão
    const cardIndex = p.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return state;
    const card = p.hand[cardIndex];

    if (zoneType === 'character' && card.type === 'character' && p.field.characters.length >= 5) {
      return state;
    }

    // Checar recursos (DON!!)
    const activeDon = p.cost_area.filter(d => !d.state.rested);
    if (activeDon.length < card.cost) return state; // Falta recurso

    // Pagar custo
    for(let i=0; i<card.cost; i++) {
        activeDon[i].state.rested = true;
    }

    // Remover da mão
    p.hand.splice(cardIndex, 1);

    // Mover pra Character, Stage ou Trash (Eventos)
    if (zoneType === 'character' && card.type === 'character') {
       card.state.location = 'field';
       p.field.characters.push(card);
    } else if (zoneType === 'stage' && card.type === 'stage') {
       card.state.location = 'field';
       if (p.field.stage) {
          p.field.stage.state.location = 'trash';
          p.trash.push(p.field.stage);
       }
       p.field.stage = card;
    } else if (card.type === 'event') {
       card.state.location = 'trash';
       p.trash.push(card);
    } else {
       return state; // Drop em lugar inválido
    }

    return newState;
  }

  static giveDon(state: GameState, action: any): GameState {
    if (this.isFinished(state)) return state;
    const newState = structuredClone(state);
    
    // O guia diz que você usa na Main Phase (para power boost de +1000)
    if (newState.phase !== 'main') return state;
    
    const { donId, targetPlayerId, targetCardId } = action;
    if (newState.active_player !== targetPlayerId) return state;

    const p = newState.players[newState.active_player];
    
    // Achar o DON ativo na cost area
    const donIndex = p.cost_area.findIndex(d => d.id === donId && !d.state.rested);
    if (donIndex === -1) return state;
    
    // Achar o alvo (Leader ou Character)
    let target = null;
    if (p.leader && p.leader.id === targetCardId) target = p.leader;
    else target = p.field.characters.find(c => c.id === targetCardId);
    
    if (!target) return state;

    // Aplica o DON
    const donCard = p.cost_area.splice(donIndex, 1)[0];
    donCard.state.location = 'field'; 
    donCard.state.rested = true; // giving a DON rests it
    (donCard.state as any).targetId = target.id;
    p.don_given.push(donCard);
    
    // Applica boost
    target.power += 1000;
    
    return newState;
  }
  static advancePhase(state: GameState): GameState {
    if (this.isFinished(state)) return state;
    const newState = structuredClone(state);
    
    switch (newState.phase) {
      case 'refresh':
        this.executeDrawPhase(newState);
        newState.phase = 'draw';
        break;
      case 'draw':
        this.executeDonPhase(newState);
        newState.phase = 'don';
        break;
      case 'don':
        newState.phase = 'main';
        break;
      case 'main':
        this.executeEndPhase(newState);
        newState.phase = 'end';
        break;
      case 'end':
        newState.turn += 1;
        newState.active_player = newState.active_player === 'P1' ? 'P2' : 'P1';
        this.executeRefreshPhase(newState);
        newState.phase = 'refresh';
        break;
    }
    
    return newState;
  }

  static executeRefreshPhase(state: GameState) {
    const p = state.players[state.active_player];
    
    // Restaura líder
    if (p.leader) {
        p.leader.state.rested = false;
        p.leader.state.activate_main_used = false;
        p.leader.state.double_attack_second_pending = false;
    }
    
    // Restaura characters
    p.field.characters.forEach(c => {
        c.state.rested = false;
        c.state.activate_main_used = false;
        c.state.double_attack_second_pending = false;
    });
    
    // Devolve DON!! da don_given para cost_area
    p.don_given.forEach(don => {
      don.state.rested = false;
      don.state.location = 'cost_area';
      (don.state as any).targetId = undefined;
      p.cost_area.push(don);
    });
    p.don_given = [];
  }

  static executeDrawPhase(state: GameState) {
    if (this.isFinished(state)) return;
    const p = state.players[state.active_player];
    
    // No turno 1 quem vai primeiro não compra? As regras variam em alguns TCGs, mas OP TCG quem vai primeiro compra sim (excepto na variante em que não compra, mas o spec não proíbe a compra no T1, só DON).
    // Atualização: Guia diz "Compre 1 carta. Sempre". E spec diz só restrição para DON!!.
    
    if (p.deck.length === 0) {
      this.triggerWinCondition(state, this.getOpponentId(state.active_player)); // Deck out
      return;
    }
    
    const card = p.deck.shift()!;
    card.state.location = 'hand';
    p.hand.push(card);
  }

  static executeDonPhase(state: GameState) {
    if (this.isFinished(state)) return;
    const p = state.players[state.active_player];
    
    // Turn 1 first player só recebe 1 DON
    const isFirstPlayer = state.active_player === state.first_player;
    const isTurn1 = state.turn === 1;
    
    const donToReceive = (isTurn1 && isFirstPlayer) ? 1 : 2;
    const amount = Math.min(donToReceive, p.don_deck.length);
    
    for (let i = 0; i < amount; i++) {
        const don = p.don_deck.shift()!;
        don.state.location = 'cost_area';
        don.state.rested = false; // Entram ativos
        p.cost_area.push(don);
    }
  }

  static executeEndPhase(state: GameState) {
    if (this.isFinished(state)) return;
    const p = state.players[state.active_player];
    
    // T03: Remove power buffs (revert to base_power) at the end of turn
    p.field.characters.forEach(c => {
        c.power = c.base_power;
        c.state.double_attack_second_pending = false;
    });
    if (p.leader) {
        p.leader.power = p.leader.base_power;
        p.leader.state.double_attack_second_pending = false;
    }
    
    // End of turn triggers go here
  }

  static execute_ko(state: GameState, cardId: string, playerId: PlayerId) {
    if (this.isFinished(state)) return;
    const p = state.players[playerId];
    const idx = p.field.characters.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const card = p.field.characters[idx];
    
    // T01: Remove from field BEFORE resolving on_leave
    p.field.characters.splice(idx, 1);
    
    if (card.keywords.includes('on_leave')) {
        // Handle recursive KO test logic temporarily until effect resolution engine is fully built
        if (card.effect && card.effect.trigger_condition === 'on_leave' && card.effect.effect_type === 'ko') {
             this.execute_ko(state, card.effect.parameters.targetId, playerId);
        }
    }
    
    // Move to trash
    card.state.location = 'trash';
    p.trash.push(card);
    
    // Remove attached DONs, put them in cost area rested
    p.don_given = p.don_given.filter(d => {
        if ((d.state as any).targetId === cardId) {
            d.state.location = 'cost_area';
            d.state.rested = true;
            (d.state as any).targetId = undefined;
            p.cost_area.push(d);
            return false;
        }
        return true;
    });
  }
}
