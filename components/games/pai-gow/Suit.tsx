import { suitColor, suitSymbol } from './suitUtils'

type Props = { suit: string }

export function Suit({ suit }: Props) {
  return <span style={{ color: suitColor(suit), fontWeight: 800 }}>{suitSymbol(suit)}</span>
}
