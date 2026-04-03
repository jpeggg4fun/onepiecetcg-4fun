export type PlayerId = 'P1' | 'P2';
export type Color = 'red' | 'green' | 'blue' | 'purple' | 'black' | 'yellow';
export type Keyword = 'rush' | 'blocker' | 'banish' | 'on_play' | 'on_leave' | 'activate_main' | 'double_attack';
export type Phase = 'setup' | 'refresh' | 'draw' | 'don' | 'main' | 'end';
export type CardLocation = 'hand' | 'field' | 'deck' | 'trash' | 'life' | 'cost_area' | 'don_deck' | 'removed';

export interface CardState {
  rested: boolean;
  location: CardLocation;
  activate_main_used?: boolean;
  double_attack_second_pending?: boolean;
}

export type TriggerCondition = 'on_play' | 'on_leave' | 'on_attack' | 'when_attacked' | 'activate_main' | 'trigger';
export type EffectType =
  | 'draw'
  | 'search'
  | 'ko'
  | 'rest'
  | 'return_to_hand'
  | 'trash'
  | 'power_buff'
  | 'add_to_hand'
  | 'give_don'
  | 'block_attack'
  | 'discard'
  | 'life_damage'
  | 'play_character';

export interface Effect {
  trigger_condition: TriggerCondition;
  effect_type: EffectType;
  parameters: Record<string, any>;
}

export interface PendingEffect {
  sourceId: string;
  effect: Effect;
  playerId: PlayerId;
  targetId?: string;
}

export interface GameInitOptions {
  seed?: number;
  open_decklist?: boolean;
}

export interface Card {
  id: string; // Unique instance ID
  card_number: string; // e.g. "OP01-001"
  type: 'leader' | 'character' | 'event' | 'stage' | 'don';
  color: Color[];
  cost: number;
  power: number;
  base_power: number; // Important to restore stats after turn ends
  counter: number | null;
  keywords: Keyword[];
  trigger: Effect | null;
  effect: Effect | null;
  state: CardState;
  
  // Display only
  name: string;
  image_url?: string;
  card_text?: string;
}

export interface LeaderCard extends Card {
  type: 'leader';
  life: number;
}

export interface PlayerState {
  id: PlayerId;
  mulligan_used: boolean;
  
  leader: LeaderCard | null;
  hand: Card[];
  deck: Card[];
  trash: Card[];
  
  field: {
    characters: Card[]; // max 5
    stage: Card | null; // max 1
  };
  
  don_deck: Card[]; // Usually 10 DON!!
  cost_area: Card[]; // Available DON!!
  don_given: Card[]; // DON!! attached to cards
  
  life_cards: Card[];
}

export interface AttackContext {
  attacker_id: string;
  target_id: string;
  attacker_power_final: number; // base + DON + buffs
  target_power_bonus: number; // Counter buffs which only last for this battle
  phase: "AWAITING_DEFENSE" | "RESOLVING";
}

export type DefenseDecisionType = 'USE_BLOCKER' | 'USE_COUNTER' | 'NO_DEFENSE';

export interface SerializedLifeView {
  count: number;
  cards: Array<{ hidden: true }>;
}

export interface SerializedPlayerView {
  id: PlayerId;
  leader: LeaderCard | null;
  hand: Card[] | { count: number };
  deck: { count: number; known_cards?: Card[] };
  trash: Card[];
  field: PlayerState['field'];
  don_deck: { count: number };
  cost_area: Card[];
  don_given: Card[];
  life_cards: SerializedLifeView;
}

export interface SerializedGameState {
  turn: number;
  first_player: PlayerId;
  active_player: PlayerId;
  phase: Phase;
  status: GameState['status'];
  winner: GameState['winner'];
  open_decklist: boolean;
  players: {
    P1: SerializedPlayerView;
    P2: SerializedPlayerView;
  };
}

export interface GameState {
  turn: number; // Starts at 1
  first_player: PlayerId;
  active_player: PlayerId;
  seed: number | null;
  open_decklist: boolean;
  phase: Phase;
  players: {
    P1: PlayerState;
    P2: PlayerState;
  };
  waiting_for: any | null; // Action prompt state
  attack_context: AttackContext | null; // A01: explicit attack state
  effect_stack: PendingEffect[]; // E01: LIFO active effect resolution
  trigger_queue: PendingEffect[]; // L01: FIFO trigger processing
  status: 'playing' | 'finished';
  winner: PlayerId | null;
}
