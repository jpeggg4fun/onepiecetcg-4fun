import type { Card } from '../types/game';

function translateText(text: string) {
  if (!text || text === 'NULL') return '';
  return text
    // Keywords
    .replace(/\[Main\]/gi, '[Principal]')
    .replace(/\[Trigger\]/gi, '[Gatilho]')
    .replace(/\[Blocker\]/gi, '[Bloqueador]')
    .replace(/\[Rush\]/gi, '[Ímpeto]')
    .replace(/\[Counter\]/gi, '[Contra-ataque]')
    .replace(/\[Activate: Main\]/gi, '[Ativação: Principal]')
    .replace(/\[Once Per Turn\]/gi, '[Uma vez por Turno]')
    .replace(/\[When Attacking\]/gi, '[Ao Atacar]')
    .replace(/\[On Play\]/gi, '[Ao Jogar]')
    // Frases literais (ST-01)
    .replace(/\(After your opponent declares an attack, you may rest this card to make it the new target of the attack\.\)/gi, '(Após seu oponente declarar um ataque, você pode virar esta carta para torná-la o novo alvo do ataque.)')
    .replace(/\(This card can attack on the turn in which it is played\.\)/gi, '(Esta carta pode atacar no turno em que é jogada.)')
    .replace(/K\.O\. up to 1 of your opponent's \[Blocker\] Characters with a cost of 3 or less\./gi, 'Nocauteie até 1 Personagem [Bloqueador] do oponente com custo 3 ou menos.')
    .replace(/K\.O\. up to 1 of your opponent's Characters with 6000 power or less\./gi, 'Nocauteie até 1 Personagem do oponente com 6000 de poder ou menos.')
    .replace(/Activate this card's \[Main\] effect\./gi, 'Ative o efeito [Principal] desta carta.')
    .replace(/Play this card\./gi, 'Jogue esta carta.')
    .replace(/Your opponent cannot activate \[Blocker\] if that Leader or Character attacks during this turn\./gi, 'Seu oponente não pode ativar [Bloqueador] se aquele Líder ou Personagem atacar durante este turno.')
    .replace(/Your opponent cannot activate \[Blocker\] during this battle\./gi, 'Seu oponente não pode ativar [Bloqueador] durante esta batalha.')
    .replace(/Your opponent cannot activate a \[Blocker\] Character that has 5000 or more power during this battle\./gi, 'Seu oponente não pode ativar um Personagem [Bloqueador] com 5000 ou mais de poder durante esta batalha.')
    .replace(/Select up to 1 of your \{Straw Hat Crew\} type Leader or Character cards\./gi, 'Selecione até 1 cartão de Líder ou Personagem do tipo {Tripulação dos Chapéus de Palha}.')
    .replace(/Give up to 2 rested DON!! cards to your Leader or 1 of your Characters\./gi, 'Dê até 2 cartões DON!! em repouso ao seu Líder ou a 1 de seus Personagens.')
    .replace(/Give up to 1 rested DON!! card to your Leader or 1 of your Characters\./gi, 'Dê até 1 cartão DON!! em repouso ao seu Líder ou a 1 de seus Personagens.')
    .replace(/Give this Leader or 1 of your Characters up to 1 rested DON!! card\./gi, 'Dê a este Líder ou a 1 de seus Personagens até 1 cartão DON!! em repouso.')
    .replace(/This Character gains \+1000 power\./gi, 'Este Personagem ganha +1000 de poder.')
    .replace(/This Character gains \[Rush\]\./gi, 'Este Personagem ganha [Ímpeto].')
    .replace(/Up to 1 of your Leader or Character cards gains \+3000 power during this battle\./gi, 'Até 1 de seus cartões de Líder ou Personagem ganha +3000 de poder durante esta batalha.')
    .replace(/Up to 1 of your Leader or Character cards gains \+1000 power during this turn\./gi, 'Até 1 de seus cartões de Líder ou Personagem ganha +1000 de poder durante este turno.')
    .replace(/Up to 1 of your Leader or Character cards other than this card gains \+1000 power during this turn\./gi, 'Até 1 de seus cartões de Líder ou Personagem diferente deste ganha +1000 de poder durante este turno.')
    .replace(/You may rest this Stage:/gi, 'Você pode virar este Cenário:')
    .replace(/Up to 1 \{Straw Hat Crew\} type Leader or Character card on your field gains \+1000 power during this turn\./gi, 'Até 1 cartão de Líder ou Personagem do tipo {Tripulação dos Chapéus de Palha} em seu campo ganha +1000 de poder durante este turno.')
    .replace(/Leader or Character/gi, 'Líder ou Personagem')
    .replace(/Cost/gi, 'Custo')
    .replace(/Power/gi, 'Poder')
    .replace(/ DON!! cards /gi, ' cartões DON!! ');
}

export async function fetchCardsByDeck(deckId: string): Promise<Card[]> {
  try {
    const res = await fetch(`https://optcgapi.com/api/decks/${deckId}/`);
    const data = await res.json();
    
    // Mapeando a resposta da API para a nossa interface
    const uniqueCards: Card[] = data.map((item: any) => ({
      id: crypto.randomUUID(), // Temporario, vamos recriar os IDs depois multiplicando
      card_number: item.card_set_id,
      name: item.card_name,
      type: item.card_type.toLowerCase() as any,
      color: [item.card_color.toLowerCase()],
      cost: item.card_cost ? (parseInt(item.card_cost, 10) || 0) : 0,
      power: item.card_power ? (parseInt(item.card_power, 10) || 0) : 0,
      base_power: item.card_power ? (parseInt(item.card_power, 10) || 0) : 0,
      counter: item.counter_amount ? (parseInt(item.counter_amount, 10) || null) : null,
      keywords: [], // Simplificado para o MVP
      trigger: null,
      effect: null,
      state: { rested: false, location: 'deck' },
      life: item.life ? (parseInt(item.life, 10) || 0) : 0,
      image_url: item.card_image,
      card_text: translateText(item.card_text)
    }));

    const leader = uniqueCards.find((c: Card) => c.type === 'leader');
    if (leader) {
      leader.state.location = 'field';
    }

    const others = uniqueCards.filter((c: Card) => c.type !== 'leader');
    const deckList: Card[] = [];

    // TCG tem 50 cartas no deck. Vamos colocar 4 copias de cada até bater ~50.
    let index = 0;
    while (deckList.length < 50 && others.length > 0) {
      const template = others[index % others.length];
      deckList.push({
        ...template,
        id: `${template.card_number}_${crypto.randomUUID()}`
      });
      index++;
    }

    return leader ? [leader, ...deckList] : deckList;
  } catch (error) {
    console.error("Erro ao puxar da API, utilizando mock vazio:", error);
    return [];
  }
}
