import React, { useEffect, useState } from 'react';
import './index.css';
import { useGameState } from './hooks/useGameState';
import type { Card, GameState, PlayerId, PlayerState } from './types/game';
import {
  ApiError,
  createGame,
  getSession,
  getOnlineGameState,
  joinGame,
  listGames,
  loginUser,
  logoutUser,
  registerUser,
  saveOnlineGameState,
  startOnlineGame,
  updateGameDeck,
  type AuthUser,
  type LobbyGame
} from './api/backend';

const STARTER_DECKS = ["ST-01", "ST-02", "ST-03", "ST-04", "ST-05", "ST-06", "ST-07", "ST-08", "ST-09", "ST-10"];

function AuthScreen({
  mode,
  username,
  password,
  error,
  loading,
  onContinueOffline,
  onModeChange,
  onUsernameChange,
  onPasswordChange,
  onSubmit
}: {
  mode: 'login' | 'register';
  username: string;
  password: string;
  error: string | null;
  loading: boolean;
  onContinueOffline: () => void;
  onModeChange: (mode: 'login' | 'register') => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="setup-badge">ONLINE MVP</div>
        <h1>Entrar no One Piece TCG Online</h1>
        <p>Login simples com username e senha para criar salas privadas por código.</p>

        <div className="auth-toggle">
          <button className={`action-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => onModeChange('login')}>Login</button>
          <button className={`action-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => onModeChange('register')}>Criar conta</button>
        </div>

        <label className="auth-field">
          <span>Username</span>
          <input value={username} onChange={(e) => onUsernameChange(e.target.value)} placeholder="ex: mugiwara_luffy" />
        </label>

        <label className="auth-field">
          <span>Senha</span>
          <input type="password" value={password} onChange={(e) => onPasswordChange(e.target.value)} placeholder="mínimo 6 caracteres" />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="btn primary auth-submit" disabled={loading} onClick={onSubmit}>
          {loading ? 'Processando...' : mode === 'login' ? 'ENTRAR' : 'CRIAR CONTA'}
        </button>
        <button className="btn" onClick={onContinueOffline}>Continuar offline</button>
      </div>
    </div>
  );
}

function LobbyScreen({
  user,
  games,
  selectedGameId,
  joinCode,
  loading,
  error,
  deckSaving,
  currentDeckSelection,
  onSelectGame,
  onJoinCodeChange,
  onDeckSelectionChange,
  onSaveDeck,
  onRefresh,
  onCreateGame,
  onJoinGame,
  onStartGame,
  onOpenBoard,
  onLogout,
  onStartLocal
}: {
  user: AuthUser;
  games: LobbyGame[];
  selectedGameId: string | null;
  joinCode: string;
  loading: boolean;
  error: string | null;
  deckSaving: boolean;
  currentDeckSelection: string;
  onSelectGame: (gameId: string) => void;
  onJoinCodeChange: (value: string) => void;
  onDeckSelectionChange: (value: string) => void;
  onSaveDeck: () => void;
  onRefresh: () => void;
  onCreateGame: () => void;
  onJoinGame: () => void;
  onStartGame: () => void;
  onOpenBoard: () => void;
  onLogout: () => void;
  onStartLocal: () => void;
}) {
  const activeGame = games.find((game) => game.id === selectedGameId) ?? games[0] ?? null;
  const isHost = activeGame?.host_user_id === user.id;
  const isGuest = activeGame?.guest_user_id === user.id;
  const selectedDeck = isHost ? activeGame?.host_deck_id : isGuest ? activeGame?.guest_deck_id : null;
  const canStart = Boolean(activeGame && isHost && activeGame.status === 'ready' && activeGame.host_deck_id && activeGame.guest_deck_id);
  const canOpenBoard = Boolean(activeGame && activeGame.status === 'in_progress' && activeGame.host_deck_id && activeGame.guest_deck_id);

  return (
    <div className="lobby-shell">
      <div className="lobby-topbar">
        <div>
          <div className="setup-badge">VERCEL + SUPABASE</div>
          <h1>Lobby privado</h1>
          <p>Logado como <strong>{user.username}</strong>. Crie uma sala por código ou entre em uma já existente.</p>
        </div>
        <div className="lobby-topbar-actions">
          <button className="btn" onClick={onStartLocal}>Treino local</button>
          <button className="btn" onClick={onRefresh}>Atualizar</button>
          <button className="btn danger" onClick={onLogout}>Sair</button>
        </div>
      </div>

      <div className="lobby-grid">
        <div className="lobby-panel">
          <h2>Sala nova</h2>
          <p>Crie uma sala privada e compartilhe o código com o outro jogador.</p>
          <button className="btn primary" disabled={loading} onClick={onCreateGame}>CRIAR SALA</button>
        </div>

        <div className="lobby-panel">
          <h2>Entrar por código</h2>
          <p>Use o código enviado pelo host.</p>
          <div className="join-row">
            <input value={joinCode} onChange={(e) => onJoinCodeChange(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} />
            <button className="btn primary" disabled={loading || !joinCode.trim()} onClick={onJoinGame}>ENTRAR</button>
          </div>
        </div>
      </div>

      {error && <div className="auth-error lobby-error">{error}</div>}

      <div className="lobby-content">
        <div className="lobby-panel">
          <h2>Suas partidas</h2>
          {games.length === 0 ? (
            <p className="lobby-empty">Nenhuma sala ainda. Crie uma partida ou entre com um código.</p>
          ) : (
            <div className="room-list">
              {games.map((game) => (
                <button
                  key={game.id}
                  className={`room-card ${activeGame?.id === game.id ? 'active' : ''}`}
                  onClick={() => onSelectGame(game.id)}
                >
                  <div className="room-code">{game.code}</div>
                  <div className="room-meta">
                    <span>{game.status === 'waiting' ? 'Aguardando' : game.status === 'ready' ? 'Pronta' : game.status}</span>
                    <strong>{game.host_username}{game.guest_username ? ` vs ${game.guest_username}` : ' vs ...'}</strong>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lobby-panel">
          <h2>Detalhes da sala</h2>
          {!activeGame ? (
            <p className="lobby-empty">Selecione ou crie uma sala para ver os detalhes.</p>
          ) : (
            <div className="room-detail">
              <div className="detail-pill">
                <span>Código</span>
                <strong>{activeGame.code}</strong>
              </div>
              <div className="detail-pill">
                <span>Status</span>
                <strong>{activeGame.status}</strong>
              </div>
              <div className="detail-pill">
                <span>Host</span>
                <strong>{activeGame.host_username ?? '---'}</strong>
              </div>
              <div className="detail-pill">
                <span>Convidado</span>
                <strong>{activeGame.guest_username ?? 'Aguardando...'}</strong>
              </div>
              {(isHost || isGuest) && (
                <div className="deck-picker">
                  <span>Seu deck nesta sala</span>
                  <div className="join-row">
                    <select value={currentDeckSelection} onChange={(e) => onDeckSelectionChange(e.target.value)}>
                      {STARTER_DECKS.map((deckId) => (
                        <option key={deckId} value={deckId}>{deckId}</option>
                      ))}
                    </select>
                    <button className="btn" disabled={deckSaving || currentDeckSelection === selectedDeck} onClick={onSaveDeck}>
                      {deckSaving ? 'Salvando...' : 'Salvar deck'}
                    </button>
                  </div>
                  <p className="lobby-note">
                    Host: <strong>{activeGame.host_deck_id ?? '---'}</strong> · Convidado: <strong>{activeGame.guest_deck_id ?? '---'}</strong>
                  </p>
                </div>
              )}
              <div className="room-detail-actions">
                {canStart && (
                  <button className="btn primary" disabled={loading} onClick={onStartGame}>INICIAR PARTIDA</button>
                )}
                {canOpenBoard && (
                  <button className="btn primary" onClick={onOpenBoard}>ABRIR MESA</button>
                )}
              </div>
              <p className="lobby-note">
                O início da sala agora passa por seleção de deck e confirmação do host. A sincronização turno a turno
                da partida ainda será a próxima camada.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SetupScreen({ onStart }: { onStart: (p1: string, p2: string) => void }) {
  const [p1, setP1] = useState('ST-01');
  const [p2, setP2] = useState('ST-01');
  const decks = ["ST-01", "ST-02", "ST-03", "ST-04", "ST-05", "ST-06", "ST-07", "ST-08", "ST-09", "ST-10"];
  
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f111a', color: '#f5c842'}}>
      <h1 style={{fontSize: '3rem', marginBottom: '40px'}}>ONE PIECE TCG - HOTSEAT</h1>
      <div style={{display: 'flex', gap: '60px', marginTop: '20px'}}>
        <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
           <h3>Deck Jogador 1</h3>
           <select value={p1} onChange={e => setP1(e.target.value)} style={{padding: 10, fontSize: 16, borderRadius: 8, background: '#161925', color: 'white'}}>
             {decks.map(d => <option key={d} value={d}>{d}</option>)}
           </select>
        </div>
        <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
           <h3>Deck Jogador 2</h3>
           <select value={p2} onChange={e => setP2(e.target.value)} style={{padding: 10, fontSize: 16, borderRadius: 8, background: '#161925', color: 'white'}}>
             {decks.map(d => <option key={d} value={d}>{d}</option>)}
           </select>
        </div>
      </div>
      <button className="btn primary" style={{marginTop: 60, padding: '15px 40px', fontSize: '18px'}} onClick={() => onStart(p1, p2)}>INICIAR JOGO</button>
    </div>
  );
}

function SetupFlow({
  playerId,
  playerState,
  needsPass,
  onReadyForPlayer,
  onDecision
}: {
  playerId: 'P1' | 'P2';
  playerState: PlayerState;
  needsPass: boolean;
  onReadyForPlayer: () => void;
  onDecision: (decision: 'MULLIGAN' | 'KEEP_HAND') => void;
}) {
  if (needsPass) {
    return (
      <div className="setup-overlay">
        <div className="setup-panel">
          <div className="setup-badge">HOTSEAT SETUP</div>
          <h2>Passe o dispositivo para {playerId}</h2>
          <p>
            A mão inicial do outro jogador fica escondida. Quando {playerId} estiver pronto para olhar a própria mão,
            continue.
          </p>
          <button className="btn primary" onClick={onReadyForPlayer}>MOSTRAR MÃO DE {playerId}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-overlay">
      <div className="setup-panel wide">
        <div className="setup-badge">MULLIGAN</div>
        <h2>{playerId}, confira sua mão inicial</h2>
        <p>
          Você pode fazer mulligan uma única vez. Se mantiver a mão agora, a partida segue para a distribuição de Life.
        </p>

        <div className="setup-hand">
          {playerState.hand.map((card) => (
            <CardPlaceholder
              key={card.id}
              card={card}
              style={{ width: 140, height: 196 }}
            />
          ))}
        </div>

        <div className="setup-actions">
          <button className="btn" onClick={() => onDecision('MULLIGAN')}>FAZER MULLIGAN</button>
          <button className="btn primary" onClick={() => onDecision('KEEP_HAND')}>MANTER MÃO</button>
        </div>
      </div>
    </div>
  );
}

function HotseatPassOverlay({
  title,
  description,
  buttonLabel,
  onContinue
}: {
  title: string;
  description: string;
  buttonLabel: string;
  onContinue: () => void;
}) {
  return (
    <div className="setup-overlay">
      <div className="setup-panel">
        <div className="setup-badge">HOTSEAT</div>
        <h2>{title}</h2>
        <p>{description}</p>
        <button className="btn primary" onClick={onContinue}>{buttonLabel}</button>
      </div>
    </div>
  );
}

function OnlineWaitingOverlay({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="setup-overlay">
      <div className="setup-panel">
        <div className="setup-badge">ONLINE</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function DefenseOverlay({
  defenderId,
  attackerPower,
  targetLabel,
  blockers,
  counters,
  selectedCounterIds,
  onToggleCounter,
  onUseCounter,
  onUseBlocker,
  onNoDefense
}: {
  defenderId: PlayerId;
  attackerPower: number;
  targetLabel: string;
  blockers: Card[];
  counters: Card[];
  selectedCounterIds: string[];
  onToggleCounter: (cardId: string) => void;
  onUseCounter: () => void;
  onUseBlocker: (blockerId: string) => void;
  onNoDefense: () => void;
}) {
  const selectedCounterPower = counters
    .filter((card) => selectedCounterIds.includes(card.id))
    .reduce((sum, card) => sum + (card.counter ?? 0), 0);

  return (
    <div className="setup-overlay">
      <div className="setup-panel wide">
        <div className="setup-badge">DEFESA</div>
        <h2>{defenderId}, responda ao ataque</h2>
        <p>
          Ataque chegando com <strong>{attackerPower}</strong> de poder em <strong>{targetLabel}</strong>. Escolha exatamente
          uma linha de defesa.
        </p>

        <div className="defense-summary">
          <div className="defense-stat">
            <span>Poder do atacante</span>
            <strong>{attackerPower}</strong>
          </div>
          <div className="defense-stat">
            <span>Counter selecionado</span>
            <strong>+{selectedCounterPower}</strong>
          </div>
        </div>

        <div className="defense-columns">
          <div className="defense-column">
            <h3>Blockers disponíveis</h3>
            {blockers.length === 0 ? (
              <p className="defense-empty">Nenhum blocker ativo disponível.</p>
            ) : (
              <div className="defense-grid">
                {blockers.map((blocker) => (
                  <button key={blocker.id} className="action-chip" onClick={() => onUseBlocker(blocker.id)}>
                    {blocker.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="defense-column">
            <h3>Counters na mão</h3>
            {counters.length === 0 ? (
              <p className="defense-empty">Nenhum counter elegível na mão.</p>
            ) : (
              <div className="counter-list">
                {counters.map((card) => {
                  const selected = selectedCounterIds.includes(card.id);
                  return (
                    <button
                      key={card.id}
                      className={`counter-item ${selected ? 'selected' : ''}`}
                      onClick={() => onToggleCounter(card.id)}
                    >
                      <span>{card.name}</span>
                      <strong>+{card.counter}</strong>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="setup-actions">
              <button className="btn" disabled={selectedCounterIds.length === 0} onClick={onUseCounter}>
                USAR COUNTER
              </button>
            </div>
          </div>
        </div>

        <div className="setup-actions">
          <button className="btn danger" onClick={onNoDefense}>SEM DEFESA</button>
        </div>
      </div>
    </div>
  );
}

const CardPlaceholder = ({ card, isBack = false, style = {}, draggable, onDragStart, onClick }: any) => {
  if (isBack) {
    return <div className="card-placeholder card-back" style={style} />;
  }
  if (!card) return null;
  const rested = card.state?.rested || false;
  
  if (card.type === 'don') {
    return (
      <div 
        className={`card-placeholder ${rested ? 'rested' : ''}`} 
        style={{...style, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#353b48', backgroundImage: 'radial-gradient(circle, #e24b4a 0%, #a83232 100%)', border: '2px solid #f5c842', color: 'white'}} 
        draggable={draggable} 
        onDragStart={onDragStart}
        onClick={onClick}
      >
        <div style={{fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic', textShadow: '2px 2px 0px #000'}}>DON!!</div>
        <div style={{fontSize: 14, fontWeight: 'bold', background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: 10, marginTop: 10}}>+1000</div>
      </div>
    );
  }

  const colorStr = card.color?.[0] || 'red';
  
  return (
    <div 
      className={`card-placeholder ${rested ? 'rested' : ''}`} 
      data-color={colorStr} 
      style={{
        ...style,
        backgroundImage: card.image_url ? `url(${card.image_url})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        border: card.image_url ? '1px solid rgba(255,255,255,0.1)' : undefined
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
    >
      {!card.image_url && card.cost !== undefined && <div className="card-cost">{card.cost}</div>}
      {!card.image_url && card.power !== undefined && <div className="card-power">{card.power}</div>}
      {!card.image_url && <div className="card-name">{card.name}</div>}
    </div>
  );
};

const PlayerHalf = ({
  isOpponent,
  playerState,
  playerId,
  canInteract,
  revealHand,
  onDropCard,
  onCardClick
}: {
  isOpponent: boolean;
  playerState: PlayerState;
  playerId: string;
  canInteract: boolean;
  revealHand: boolean;
  onDropCard: any;
  onCardClick: (c: Card) => void;
}) => {
  const allowDrop = (e: React.DragEvent) => { e.preventDefault(); };

  return (
    <div className={`player-half ${isOpponent ? 'opponent' : ''}`}>
      <div className="board-surface">
        <div className="board-row board-row-top">
          <div className="zone zone-life" data-label="VIDA">
            {playerState.life_cards.map((c, i) => (
              <CardPlaceholder
                key={c.id}
                isBack
                style={{
                  marginTop: i > 0 ? `${i * 10}px` : '0px',
                  position: i === 0 ? 'relative' : 'absolute'
                }}
              />
            ))}
            <div className="pile-badge pile-badge-left">{playerState.life_cards.length}</div>
          </div>

          <div
            className="zone zone-character"
            data-label="ÁREA DE PERSONAGENS"
            onDragOver={canInteract ? allowDrop : undefined}
            onDrop={(e) => {
              if (!canInteract) return;
              const cardId = e.dataTransfer.getData("cardId");
              if (cardId) onDropCard(e, playerId, 'character');
            }}
          >
            {playerState.field.characters.map((c: Card) => {
              const attachedDon = playerState.don_given.filter(d => (d.state as any).targetId === c.id).length;
              return (
                <div
                  key={c.id}
                  onDragOver={canInteract ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
                  onDrop={canInteract ? (e) => { e.preventDefault(); e.stopPropagation(); onDropCard(e, playerId, 'character_target', c.id); } : undefined}
                  style={{ position: 'relative' }}
                >
                  <CardPlaceholder card={c} onClick={() => onCardClick(c)} />
                  {attachedDon > 0 && (
                    <div style={{position: 'absolute', bottom: -15, width: '100%', textAlign: 'center', background: '#e24b4a', color: 'white', fontWeight: 'bold', borderRadius: 4, zIndex: 10}}>
                      +{attachedDon} DON!!
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="stack-slot stack-slot-deck" data-label="DECK PRINCIPAL">
            {playerState.deck.length > 0 && <CardPlaceholder isBack />}
            <div className="pile-badge">{playerState.deck.length}</div>
          </div>
        </div>

        <div className="board-row board-row-bottom">
          <div className="zone zone-don-stack" data-label="DECK DON!!">
            {playerState.don_deck.length > 0 && <CardPlaceholder isBack style={{ transform: 'scale(0.92)' }} />}
            <div className="pile-badge">{playerState.don_deck.length}</div>
          </div>

          <div className="bottom-center">
            <div
              className="zone zone-leader"
              data-label="LÍDER"
              onDragOver={canInteract ? allowDrop : undefined}
              onDrop={(e) => {
                if (!canInteract) return;
                onDropCard(e, playerId, 'leader_target', playerState.leader?.id);
              }}
            >
              {playerState.leader && (() => {
                const attachedDon = playerState.don_given.filter(d => (d.state as any).targetId === playerState.leader!.id).length;
                return (
                  <div
                    style={{position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center'}}
                    onDragOver={canInteract ? allowDrop : undefined}
                    onDrop={canInteract ? (e) => { e.preventDefault(); e.stopPropagation(); onDropCard(e, playerId, 'leader_target', playerState.leader?.id); } : undefined}
                  >
                    <CardPlaceholder card={playerState.leader} onClick={() => onCardClick(playerState.leader!)} />
                    {attachedDon > 0 && (
                      <div style={{position: 'absolute', bottom: -15, width: '100%', textAlign: 'center', background: '#e24b4a', color: 'white', fontWeight: 'bold', borderRadius: 4, zIndex: 10}}>
                        +{attachedDon} DON!!
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div
              className="zone zone-stage"
              data-label="CENÁRIO"
              onDragOver={canInteract ? allowDrop : undefined}
              onDrop={(e) => {
                if (!canInteract) return;
                onDropCard(e, playerId, 'stage');
              }}
            >
              {playerState.field.stage && <CardPlaceholder card={playerState.field.stage} onClick={() => onCardClick(playerState.field.stage!)} />}
            </div>

            <div className="zone zone-cost" data-label={`ÁREA DE CUSTO (${playerState.cost_area.filter(d => !d.state.rested).length}/${playerState.cost_area.length})`}>
              {playerState.cost_area.map((don) => (
                <CardPlaceholder
                  key={don.id}
                  card={don}
                  style={{transform: 'scale(0.8)'}}
                  draggable={canInteract && !don.state.rested}
                  onDragStart={(e: React.DragEvent) => {
                    if (!canInteract || don.state.rested) return;
                    e.dataTransfer.setData("donId", don.id);
                  }}
                  onClick={() => onCardClick(don)}
                />
              ))}
            </div>
          </div>

          <div className="stack-slot stack-slot-trash" data-label="LIXEIRA">
            {playerState.trash.length > 0 && <CardPlaceholder card={playerState.trash[playerState.trash.length-1]} onClick={() => onCardClick(playerState.trash[playerState.trash.length-1])} />}
            <div className="pile-badge">{playerState.trash.length}</div>
          </div>
        </div>
      </div>
      
      <div className={`hand-container ${isOpponent ? 'hand-opponent' : 'hand-local'}`}>
        {playerState.hand.map(c => (
           <CardPlaceholder 
             key={c.id} 
             card={c} 
             isBack={!revealHand}
             draggable={canInteract}
             onDragStart={(e: React.DragEvent) => {
               if (!canInteract) return;
               e.dataTransfer.setData("cardId", c.id);
             }}
             onClick={() => {
               if (revealHand) onCardClick(c);
             }}
           />
        ))}
      </div>
    </div>
  );
};

class ErrorBoundary extends React.Component<any, { error: Error | null }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return <div style={{color:'red', padding: 20}}><h1>UI Crashed</h1><pre>{this.state.error.stack}</pre></div>;
    }
    return this.props.children;
  }
}

function MainApp() {
  const { gameState, loading, screen, startGame, advancePhase, dispatchAction, replaceGameState } = useGameState();
  const [focusedCard, setFocusedCard] = useState<Card | null>(null);
  const [setupViewer, setSetupViewer] = useState<'P1' | 'P2' | null>(null);
  const [defenseViewer, setDefenseViewer] = useState<PlayerId | null>(null);
  const [selectedCounterIds, setSelectedCounterIds] = useState<string[]>([]);
  const [onlineMode, setOnlineMode] = useState<'auth' | 'lobby' | 'local' | 'online'>('auth');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [games, setGames] = useState<LobbyGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [selectedLobbyDeck, setSelectedLobbyDeck] = useState('ST-01');
  const [deckSaving, setDeckSaving] = useState(false);
  const [activeOnlineGameId, setActiveOnlineGameId] = useState<string | null>(null);
  const [activeOnlineRoom, setActiveOnlineRoom] = useState<LobbyGame | null>(null);
  const [lastSnapshotId, setLastSnapshotId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'syncing' | 'conflict'>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const bootstrapSession = async () => {
      setAuthLoading(true);
      setOnlineError(null);

      try {
        const { user } = await getSession();
        if (!active) return;

        setAuthUser(user);
        setOnlineMode(user ? 'lobby' : 'auth');
      } catch (error) {
        if (!active) return;
        setOnlineError(error instanceof Error ? error.message : 'Falha ao verificar sessão.');
        setOnlineMode('auth');
      } finally {
        if (active) setAuthLoading(false);
      }
    };

    bootstrapSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authUser || onlineMode !== 'lobby') return;

    let active = true;
    let intervalId: number | null = null;

    const refreshGames = async () => {
      try {
        const response = await listGames();
        if (!active) return;
        setGames(response.games);
        setSelectedGameId((current) => current ?? response.games[0]?.id ?? null);
      } catch (error) {
        if (!active) return;
        setOnlineError(error instanceof Error ? error.message : 'Falha ao carregar partidas.');
      }
    };

    refreshGames();
    intervalId = window.setInterval(refreshGames, 5000);

    return () => {
      active = false;
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [authUser, onlineMode]);

  useEffect(() => {
    if (onlineMode !== 'online' || !activeOnlineGameId || !authUser) return;

    let active = true;
    let intervalId: number | null = null;

    const syncRoomState = async () => {
      try {
        setSyncState((current) => current === 'saving' ? current : 'syncing');
        const { game, snapshot } = await getOnlineGameState(activeOnlineGameId);
        setActiveOnlineRoom((current) => current ? { ...current, ...game } : current);
        if (!active) return;
        if (!snapshot || snapshot.id === lastSnapshotId) {
          setSyncState((current) => current === 'saving' ? current : 'idle');
          return;
        }

        const stateJson = snapshot.state_json as Record<string, unknown>;
        if (stateJson && 'players' in stateJson) {
          replaceGameState(stateJson as unknown as GameState);
          setLastSnapshotId(snapshot.id);
          setSyncMessage(null);
        }
        setSyncState((current) => current === 'saving' ? current : 'idle');
      } catch (error) {
        if (!active) return;
        setOnlineError(error instanceof Error ? error.message : 'Falha ao sincronizar a partida.');
        setSyncState('idle');
      }
    };

    syncRoomState();
    intervalId = window.setInterval(syncRoomState, 2500);

    return () => {
      active = false;
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [activeOnlineGameId, authUser, lastSnapshotId, onlineMode, replaceGameState]);

  const runAuthFlow = async () => {
    setOnlineLoading(true);
    setOnlineError(null);

    try {
      const response = authMode === 'login'
        ? await loginUser(authUsername, authPassword)
        : await registerUser(authUsername, authPassword);

      setAuthUser(response.user);
      setOnlineMode('lobby');
      setAuthPassword('');
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : 'Falha de autenticação.');
    } finally {
      setOnlineLoading(false);
    }
  };

  const refreshLobby = async () => {
    setOnlineLoading(true);
    setOnlineError(null);

    try {
      const response = await listGames();
      setGames(response.games);
      setSelectedGameId((current) => {
        const nextSelectedId = current ?? response.games[0]?.id ?? null;
        const selectedGame = response.games.find((game) => game.id === nextSelectedId);
        if (selectedGame && authUser) {
          const ownDeck = selectedGame.host_user_id === authUser.id ? selectedGame.host_deck_id : selectedGame.guest_deck_id;
          setSelectedLobbyDeck(ownDeck ?? 'ST-01');
        }
        return nextSelectedId;
      });
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : 'Falha ao atualizar o lobby.');
    } finally {
      setOnlineLoading(false);
    }
  };

  const handleCreateOnlineGame = async () => {
    setOnlineLoading(true);
    setOnlineError(null);

    try {
      const response = await createGame();
      setSelectedGameId(response.game.id);
      setJoinCode(response.game.code);
      await refreshLobby();
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : 'Falha ao criar sala.');
      setOnlineLoading(false);
    }
  };

  const handleJoinOnlineGame = async () => {
    setOnlineLoading(true);
    setOnlineError(null);

    try {
      const response = await joinGame(joinCode);
      setSelectedGameId(response.game.id);
      await refreshLobby();
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : 'Falha ao entrar na sala.');
      setOnlineLoading(false);
    }
  };

  const handleLogout = async () => {
    setOnlineLoading(true);
    setOnlineError(null);

    try {
      await logoutUser();
      setAuthUser(null);
      setGames([]);
      setSelectedGameId(null);
      setActiveOnlineRoom(null);
      setSyncMessage(null);
      setSyncState('idle');
      setOnlineMode('auth');
      setAuthPassword('');
      setAuthUsername('');
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : 'Falha ao encerrar sessão.');
    } finally {
      setOnlineLoading(false);
    }
  };

  if (authLoading) {
    return <div style={{display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', color: '#f5c842', background: '#0f111a'}}>CARREGANDO SESSÃO...</div>;
  }

  if (onlineMode === 'auth') {
    return (
      <AuthScreen
        mode={authMode}
        username={authUsername}
        password={authPassword}
        error={onlineError}
        loading={onlineLoading}
        onContinueOffline={() => {
          setActiveOnlineGameId(null);
          setLastSnapshotId(null);
          setOnlineMode('local');
        }}
        onModeChange={setAuthMode}
        onUsernameChange={setAuthUsername}
        onPasswordChange={setAuthPassword}
        onSubmit={runAuthFlow}
      />
    );
  }

  if (onlineMode === 'lobby' && authUser) {
    const selectedGame = games.find((game) => game.id === selectedGameId) ?? null;
    const handleSelectGame = (gameId: string) => {
      setSelectedGameId(gameId);
      const game = games.find((item) => item.id === gameId);
      if (!game) return;
      const ownDeck = game.host_user_id === authUser.id ? game.host_deck_id : game.guest_deck_id;
      setSelectedLobbyDeck(ownDeck ?? 'ST-01');
    };

    const handleSaveDeck = async () => {
      if (!selectedGame) return;
      setDeckSaving(true);
      setOnlineError(null);

      try {
        await updateGameDeck(selectedGame.id, selectedLobbyDeck);
        await refreshLobby();
      } catch (error) {
        setOnlineError(error instanceof Error ? error.message : 'Falha ao salvar deck.');
      } finally {
        setDeckSaving(false);
      }
    };

    const handleStartRoom = async () => {
      if (!selectedGame) return;
      setOnlineLoading(true);
      setOnlineError(null);

      try {
        await startOnlineGame(selectedGame.id);
        await refreshLobby();
      } catch (error) {
        setOnlineError(error instanceof Error ? error.message : 'Falha ao iniciar a partida.');
      } finally {
        setOnlineLoading(false);
      }
    };

    const handleOpenBoard = async () => {
      if (!selectedGame?.host_deck_id || !selectedGame.guest_deck_id) return;
      const roomState = await getOnlineGameState(selectedGame.id);
      setActiveOnlineRoom({ ...selectedGame, ...roomState.game });
      const snapshotState = roomState.snapshot?.state_json as Record<string, unknown> | undefined;

      if (snapshotState && 'players' in snapshotState) {
        replaceGameState(snapshotState as unknown as GameState);
        setLastSnapshotId(roomState.snapshot?.id ?? null);
        setSyncMessage(null);
      } else {
        const nextState = await startGame(selectedGame.host_deck_id, selectedGame.guest_deck_id, {
          firstPlayerId: selectedGame.first_player ?? undefined,
          seed: Number(snapshotState?.seed ?? Date.now())
        });
        if (nextState) {
          const saved = await saveOnlineGameState(selectedGame.id, nextState, nextState.turn, nextState.phase, roomState.snapshot?.id ?? null);
          setLastSnapshotId(saved.snapshot.id);
          setSyncMessage(null);
        }
      }

      setActiveOnlineGameId(selectedGame.id);
      setSyncState('idle');
      setOnlineMode('online');
    };

    return (
      <LobbyScreen
        user={authUser}
        games={games}
        selectedGameId={selectedGameId}
        joinCode={joinCode}
        loading={onlineLoading}
        error={onlineError}
        deckSaving={deckSaving}
        currentDeckSelection={selectedLobbyDeck}
        onSelectGame={handleSelectGame}
        onJoinCodeChange={setJoinCode}
        onDeckSelectionChange={setSelectedLobbyDeck}
        onSaveDeck={handleSaveDeck}
        onRefresh={refreshLobby}
        onCreateGame={handleCreateOnlineGame}
        onJoinGame={handleJoinOnlineGame}
        onStartGame={handleStartRoom}
        onOpenBoard={handleOpenBoard}
        onLogout={handleLogout}
        onStartLocal={() => {
          setActiveOnlineGameId(null);
          setActiveOnlineRoom(null);
          setLastSnapshotId(null);
          setOnlineMode('local');
        }}
      />
    );
  }

  if (screen === 'setup') {
    return <SetupScreen onStart={startGame} />;
  }

  if (loading || !gameState) {
    return <div style={{display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', color: '#f5c842', background: '#0f111a'}}>CARREGANDO MOTOR...</div>;
  }

  const p1 = gameState.players['P1'];
  const p2 = gameState.players['P2'];
  const waitingFor = gameState.waiting_for;
  const activePlayer = gameState.active_player;
  const opponentPlayer = activePlayer === 'P1' ? 'P2' : 'P1';
  const localPlayerId: PlayerId = onlineMode === 'online' && authUser && activeOnlineRoom
    ? activeOnlineRoom.host_user_id === authUser.id
      ? 'P1'
      : 'P2'
    : 'P1';
  const remotePlayerId: PlayerId = localPlayerId === 'P1' ? 'P2' : 'P1';
  const isOnlineBoard = onlineMode === 'online';
  const isLocalUsersTurn = !isOnlineBoard || gameState.active_player === localPlayerId;
  const setupPendingPlayer =
    gameState.phase === 'setup' && waitingFor
      ? (!waitingFor.p1_ready ? 'P1' : !waitingFor.p2_ready ? 'P2' : null)
      : null;
  const needsPassScreen = !isOnlineBoard && setupPendingPlayer !== null && setupViewer !== setupPendingPlayer;
  const attackContext = gameState.attack_context;
  const defensePending = attackContext?.phase === 'AWAITING_DEFENSE' ? opponentPlayer : null;
  const defenseNeedsPass = !isOnlineBoard && defensePending !== null && defenseViewer !== defensePending;
  const canInteractWithPlayer = (playerId: PlayerId) => !isOnlineBoard || playerId === localPlayerId;

  const persistOnlineState = (nextState: GameState | null) => {
    if (!isOnlineBoard || !activeOnlineGameId || !nextState) return;
    setSyncState('saving');
    setSyncMessage('Sincronizando sua jogada...');
    void saveOnlineGameState(activeOnlineGameId, nextState, nextState.turn, nextState.phase, lastSnapshotId)
      .then((result) => {
        setLastSnapshotId(result.snapshot.id);
        setSyncState('idle');
        setSyncMessage('Jogada sincronizada.');
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 409) {
          const latestSnapshot = error.payload.latestSnapshot as { id?: string; state_json?: unknown } | undefined;
          const latestState = latestSnapshot?.state_json as Record<string, unknown> | undefined;

          if (latestState && 'players' in latestState) {
            replaceGameState(latestState as unknown as GameState);
          }

          setLastSnapshotId(typeof latestSnapshot?.id === 'string' ? latestSnapshot.id : null);
          setSyncState('conflict');
          setSyncMessage('Outra jogada entrou primeiro. A mesa foi atualizada para o estado mais recente.');
          return;
        }

        setOnlineError(error instanceof Error ? error.message : 'Falha ao salvar a partida online.');
        setSyncState('idle');
      });
  };

  const getCardOwner = (cardId: string): PlayerId | null => {
    if (p1.leader?.id === cardId || p1.hand.some((card) => card.id === cardId) || p1.field.characters.some((card) => card.id === cardId) || p1.field.stage?.id === cardId || p1.trash.some((card) => card.id === cardId) || p1.cost_area.some((card) => card.id === cardId) || p1.don_given.some((card) => card.id === cardId)) return 'P1';
    if (p2.leader?.id === cardId || p2.hand.some((card) => card.id === cardId) || p2.field.characters.some((card) => card.id === cardId) || p2.field.stage?.id === cardId || p2.trash.some((card) => card.id === cardId) || p2.cost_area.some((card) => card.id === cardId) || p2.don_given.some((card) => card.id === cardId)) return 'P2';
    return null;
  };

  const getAttackTargets = (card: Card) => {
    if (gameState.phase !== 'main' || attackContext) return [];
    const owner = getCardOwner(card.id);
    if (owner !== activePlayer) return [];
    const canAttack = !card.state.rested || card.state.double_attack_second_pending;
    if (!canAttack || (card.type !== 'leader' && card.type !== 'character')) return [];

    const targets: Array<{ id: string; label: string }> = [];
    if (gameState.players[opponentPlayer].leader) {
      targets.push({
        id: gameState.players[opponentPlayer].leader!.id,
        label: `Líder ${opponentPlayer}`
      });
    }

    gameState.players[opponentPlayer].field.characters
      .filter((target) => target.state.rested)
      .forEach((target) => {
        targets.push({ id: target.id, label: target.name });
      });

    return targets;
  };

  const focusedOwner = focusedCard ? getCardOwner(focusedCard.id) : null;
  const focusedAttackTargets = focusedCard ? getAttackTargets(focusedCard) : [];
  const defenderState = defensePending ? gameState.players[defensePending] : null;
  const availableBlockers = defenderState
    ? defenderState.field.characters.filter((card) => !card.state.rested && card.keywords.includes('blocker'))
    : [];
  const availableCounters = defenderState
    ? defenderState.hand.filter((card) => (card.counter ?? 0) > 0)
    : [];
  const currentTargetLabel = defensePending && attackContext
    ? (() => {
        const leader = gameState.players[defensePending].leader;
        if (leader?.id === attackContext.target_id) return `Líder ${defensePending}`;
        return gameState.players[defensePending].field.characters.find((card) => card.id === attackContext.target_id)?.name ?? 'alvo';
      })()
    : 'alvo';

  const handleDropCard = (e: React.DragEvent, targetPlayerId: string, zoneType: string, targetCardId?: string) => {
    e.preventDefault();
    if (!canInteractWithPlayer(targetPlayerId as PlayerId) || !isLocalUsersTurn) return;
    const cardId = e.dataTransfer.getData("cardId");
    const donId = e.dataTransfer.getData("donId");

    if (donId) {
      const nextState = dispatchAction({ type: 'GIVE_DON', donId, targetPlayerId, targetCardId });
      persistOnlineState(nextState);
      return;
    }

    if (cardId) {
      const nextState = dispatchAction({ type: 'PLAY_CARD', cardId, targetPlayerId, zoneType });
      persistOnlineState(nextState);
    }
  };

  const handleSetupDecision = (decision: 'MULLIGAN' | 'KEEP_HAND') => {
    if (!setupPendingPlayer || (isOnlineBoard && setupPendingPlayer !== localPlayerId)) return;
    const nextState = dispatchAction({ type: 'SETUP_DECISION', playerId: setupPendingPlayer, decision });
    persistOnlineState(nextState);
    setSetupViewer(null);
  };

  const handleDeclareAttack = (attackerId: string, targetId: string) => {
    if (!isLocalUsersTurn) return;
    const nextState = dispatchAction({ type: 'DECLARE_ATTACK', attackerId, targetId });
    persistOnlineState(nextState);
    setFocusedCard(null);
    setDefenseViewer(null);
    setSelectedCounterIds([]);
  };

  const handleDefenseDecision = (decision: 'USE_BLOCKER' | 'USE_COUNTER' | 'NO_DEFENSE', extra: Record<string, unknown> = {}) => {
    if (!defensePending || (isOnlineBoard && defensePending !== localPlayerId)) return;
    const nextState = dispatchAction({ type: 'DEFENSE_DECISION', playerId: defensePending, decision, ...extra });
    persistOnlineState(nextState);
    setDefenseViewer(null);
    setSelectedCounterIds([]);
    setFocusedCard(null);
  };

  const handleToggleCounter = (cardId: string) => {
    setSelectedCounterIds((current) => current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]);
  };

  const handleAdvancePhase = () => {
    if (attackContext || !isLocalUsersTurn) return;
    const nextState = advancePhase();
    persistOnlineState(nextState);
  };

  return (
    <div className="app-container">
      {setupPendingPlayer && (
        isOnlineBoard ? (
          setupPendingPlayer === localPlayerId ? (
            <SetupFlow
              playerId={setupPendingPlayer}
              playerState={gameState.players[setupPendingPlayer]}
              needsPass={false}
              onReadyForPlayer={() => undefined}
              onDecision={handleSetupDecision}
            />
          ) : (
            <OnlineWaitingOverlay
              title={`Aguardando decisão de ${setupPendingPlayer}`}
              description="O outro jogador ainda está resolvendo o mulligan. Assim que ele confirmar a mão, a partida continua automaticamente."
            />
          )
        ) : (
          <SetupFlow
            playerId={setupPendingPlayer}
            playerState={gameState.players[setupPendingPlayer]}
            needsPass={needsPassScreen}
            onReadyForPlayer={() => setSetupViewer(setupPendingPlayer)}
            onDecision={handleSetupDecision}
          />
        )
      )}

      {defensePending && (
        isOnlineBoard ? (
          defensePending === localPlayerId ? (
            <DefenseOverlay
              defenderId={defensePending}
              attackerPower={attackContext!.attacker_power_final}
              targetLabel={currentTargetLabel}
              blockers={availableBlockers}
              counters={availableCounters}
              selectedCounterIds={selectedCounterIds}
              onToggleCounter={handleToggleCounter}
              onUseCounter={() => handleDefenseDecision('USE_COUNTER', { cardIds: selectedCounterIds })}
              onUseBlocker={(blockerId) => handleDefenseDecision('USE_BLOCKER', { blockerId })}
              onNoDefense={() => handleDefenseDecision('NO_DEFENSE')}
            />
          ) : (
            <OnlineWaitingOverlay
              title={`Aguardando defesa de ${defensePending}`}
              description="O defensor está escolhendo blocker, counter ou aceitando o dano. O estado da sala será sincronizado assim que a resposta chegar."
            />
          )
        ) : defenseNeedsPass ? (
          <HotseatPassOverlay
            title={`Passe o dispositivo para ${defensePending}`}
            description="O defensor agora escolhe blocker, counter ou aceita o dano. A mão defensiva fica oculta até esta confirmação."
            buttonLabel={`MOSTRAR DEFESA DE ${defensePending}`}
            onContinue={() => setDefenseViewer(defensePending)}
          />
        ) : (
          <DefenseOverlay
            defenderId={defensePending}
            attackerPower={attackContext!.attacker_power_final}
            targetLabel={currentTargetLabel}
            blockers={availableBlockers}
            counters={availableCounters}
            selectedCounterIds={selectedCounterIds}
            onToggleCounter={handleToggleCounter}
            onUseCounter={() => handleDefenseDecision('USE_COUNTER', { cardIds: selectedCounterIds })}
            onUseBlocker={(blockerId) => handleDefenseDecision('USE_BLOCKER', { blockerId })}
            onNoDefense={() => handleDefenseDecision('NO_DEFENSE')}
          />
        )
      )}

      {focusedCard && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40}} onClick={() => setFocusedCard(null)}>
           <div style={{width: 350, height: 490}} onClick={e => e.stopPropagation()}>
             <CardPlaceholder card={focusedCard} style={{width: '100%', height: '100%', pointerEvents: 'none'}} />
           </div>
           
           {focusedCard.type !== 'don' && (
             <div style={{width: 400, background: '#161925', padding: 25, borderRadius: 12, color: 'white', border: '1px solid #f5c842'}} onClick={e => e.stopPropagation()}>
                <h2 style={{color: '#f5c842', margin: '0 0 10px 0', fontSize: 24}}>{focusedCard.name}</h2>
                <div style={{display: 'flex', gap: 10, marginBottom: 15, fontSize: 13, opacity: 0.8}}>
                  <span style={{background: '#353b48', padding: '4px 8px', borderRadius: 4}}>
                    {focusedCard.type === 'leader' ? 'LÍDER' : focusedCard.type === 'character' ? 'PERSONAGEM' : focusedCard.type === 'stage' ? 'CENÁRIO' : focusedCard.type === 'event' ? 'EVENTO' : 'DON!!'}
                  </span>
                  {focusedCard.color?.map(c => <span key={c} style={{background: c, padding: '4px 8px', borderRadius: 4, color: 'white', textTransform: 'capitalize'}}>{c === 'red' ? 'Vermelho' : c === 'blue' ? 'Azul' : c === 'green' ? 'Verde' : c === 'purple' ? 'Roxo' : c === 'black' ? 'Preto' : c === 'yellow' ? 'Amarelo' : c}</span>)}
                </div>
                
                <div style={{display: 'flex', gap: 20, marginBottom: 20, paddingBottom: 15, borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
                  {(focusedCard.cost !== undefined && focusedCard.cost > 0) ? <div><b style={{color: '#f5c842'}}>Custo:</b> <span style={{fontSize: 20}}>{focusedCard.cost}</span></div> : null}
                  {(focusedCard.power !== undefined && focusedCard.power > 0) ? <div><b style={{color: '#f5c842'}}>Poder:</b> <span style={{fontSize: 20}}>{focusedCard.power}</span></div> : null}
                  {focusedCard.counter ? <div><b style={{color: '#f5c842'}}>Contra-ataque:</b> {focusedCard.counter}</div> : null}
                </div>

                <div style={{fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap'}}>
                   {focusedCard.card_text === 'NULL' || !focusedCard.card_text ? <i style={{opacity: 0.5}}>Sem efeito descrito.</i> : focusedCard.card_text}
                </div>

                {focusedOwner === activePlayer && focusedOwner === localPlayerId && focusedAttackTargets.length > 0 && (
                  <div className="card-action-panel">
                    <div className="card-action-title">Atacar</div>
                    <div className="card-action-grid">
                      {focusedAttackTargets.map((target) => (
                        <button
                          key={target.id}
                          className="action-chip"
                          onClick={() => handleDeclareAttack(focusedCard.id, target.id)}
                        >
                          {target.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
             </div>
           )}
        </div>
      )}

      <div className="game-hud">
        <div style={{color: 'white', marginBottom: '8px', fontSize: '14px'}}>
          Turno: {gameState.turn}
          <br />
          <b style={{color: '#f5c842'}}>{gameState.active_player} ATIVO</b>
          {isOnlineBoard && (
            <>
              <br />
              <span style={{opacity: 0.8}}>Você é {localPlayerId}</span>
              <br />
              <span className={`sync-pill ${isLocalUsersTurn ? 'is-active' : 'is-waiting'}`}>
                {isLocalUsersTurn ? 'Sua vez' : 'Vez do oponente'}
              </span>
              {syncMessage && (
                <>
                  <br />
                  <span className={`sync-pill ${syncState === 'conflict' ? 'is-conflict' : syncState === 'saving' || syncState === 'syncing' ? 'is-syncing' : 'is-idle'}`}>
                    {syncMessage}
                  </span>
                </>
              )}
            </>
          )}
        </div>
        <button className="btn" onClick={() => {
          setActiveOnlineGameId(null);
          setActiveOnlineRoom(null);
          setLastSnapshotId(null);
          setSyncMessage(null);
          setSyncState('idle');
          setOnlineMode(authUser ? 'lobby' : 'auth');
        }}>
          {authUser ? 'Voltar ao lobby' : 'Voltar ao login'}
        </button>
        <button className="btn" disabled={Boolean(attackContext) || !isLocalUsersTurn} onClick={handleAdvancePhase}>
          {gameState.phase === 'main' ? 'Encerrar Principal' : 'Próxima Fase'}
        </button>
      </div>

      <div className="phase-indicator">
        <div className={`phase-step ${gameState.phase === 'setup' ? 'active' : ''}`}>Setup</div>
        <div className={`phase-step ${gameState.phase === 'refresh' ? 'active' : ''}`}>Recarga</div>
        <div className={`phase-step ${gameState.phase === 'draw' ? 'active' : ''}`}>Compra</div>
        <div className={`phase-step ${gameState.phase === 'don' ? 'active' : ''}`}>DON!!</div>
        <div className={`phase-step ${gameState.phase === 'main' ? 'active' : ''}`}>Principal</div>
        <div className={`phase-step ${gameState.phase === 'end' ? 'active' : ''}`}>Fim</div>
      </div>

      <div className="game-board">
        <PlayerHalf
          isOpponent={true}
          playerState={gameState.players[remotePlayerId]}
          playerId={remotePlayerId}
          canInteract={false}
          revealHand={false}
          onDropCard={handleDropCard}
          onCardClick={setFocusedCard}
        />
        <PlayerHalf
          isOpponent={false}
          playerState={gameState.players[localPlayerId]}
          playerId={localPlayerId}
          canInteract={isLocalUsersTurn}
          revealHand={true}
          onDropCard={handleDropCard}
          onCardClick={setFocusedCard}
        />
      </div>
    </div>
  );
}

export default function App() {
  return <ErrorBoundary><MainApp /></ErrorBoundary>;
}
