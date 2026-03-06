export function suitSymbol(suit: string): string {
  switch (suit) {
    case 'C':
      return '♣'
    case 'D':
      return '♦'
    case 'H':
      return '♥'
    case 'S':
      return '♠'
    case 'J':
      return '🃏'
    default:
      return suit
  }
}

export function suitColor(suit: string): string {
  // Standard card convention: red for hearts/diamonds, black for spades/clubs.
  // Joker is rendered in brand green.
  if (suit === 'J') return 'var(--ac-green)'
  return suit === 'D' || suit === 'H' ? '#B91C1C' : '#000000'
}
