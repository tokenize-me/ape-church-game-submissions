import { useEffect, useMemo, useState } from 'react'

import { Suit } from './Suit'
import { suitColor, suitSymbol } from './suitUtils'

const backLogo = '/submissions/pai-gow/assets/back-logo.png'
const jokerCard = '/submissions/pai-gow/assets/cards/JOKER.png'

// Next.js note: Vite's `import.meta.glob` isn't available.
// We load card faces from `public/pai-gow/cards/*.png` by direct path.
// const cardPngByName: Record<string, string> = {}

type Card = { rank: string; suit: string }

type Props = {
  card: Card
  onClick?: () => void
  tone?: 'neutral' | 'low' | 'high'
  faceDown?: boolean
  title?: string
}

const rankMap: Record<string, string> = {
  A: 'A',
  K: 'K',
  Q: 'Q',
  J: 'J',
  T: '10',
}

function rankLabel(r: string) {
  if (r === 'X') return 'JOKER'
  return rankMap[r] ?? r
}

function cardImageName(rank: string, suit: string) {
  // Asset pack uses: 2-9, T, J, Q, K, A + suit letters C/D/H/S
  const r = rank === 'T' ? 'T' : rank
  const s = suit
  const base = `${r}${s}`.toUpperCase()
  return `${base}.png`
}

export function CardFace({ card, onClick, tone = 'neutral', faceDown = false, title }: Props) {
  const border =
    faceDown
      ? 'rgba(0,0,0,0.95)'
      : tone === 'low'
        ? 'var(--ac-blue)'
        : tone === 'high'
          ? 'var(--ac-gold)'
          : 'rgba(0,0,0,0.25)'

  const accentShadow =
    tone === 'low'
      ? '0 0 0 2px rgba(105, 174, 251, 0.22)'
      : tone === 'high'
        ? '0 0 0 2px rgba(239, 185, 11, 0.20)'
        : 'none'

  const text = suitColor(card.suit)

  const faceBg = useMemo(
    () =>
      'linear-gradient(180deg, #FFFFFF 0%, #F3F6F8 45%, #E8EEF2 100%)',
    [],
  )

  // Back: use ApeChurch brand-y back (green/blue/gold glow on dark) so facedown cards are visible.
  const cardBackBg =
    'radial-gradient(160px 120px at 25% 20%, rgba(140,255,0,0.22), transparent 60%), radial-gradient(160px 120px at 75% 80%, rgba(105,174,251,0.18), transparent 62%), linear-gradient(180deg, rgba(12,14,12,0.98), rgba(6,7,6,0.98))'

  const flip = !faceDown

  // Shine burst when a card is revealed
  const [shine, setShine] = useState(false)
  void shine
  useEffect(() => {
    if (!faceDown) {
      const t0 = window.setTimeout(() => setShine(true), 0)
      const t1 = window.setTimeout(() => setShine(false), 650)
      return () => {
        window.clearTimeout(t0)
        window.clearTimeout(t1)
      }
    }
  }, [faceDown])

  const isJoker = card.suit === 'J'
  const faceSrc = !isJoker ? `/submissions/pai-gow/assets/cards/${cardImageName(card.rank, card.suit)}` : undefined

  const usePngFace = !!faceSrc || isJoker

  return (
    <button
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        width: 'var(--cardW, 72px)',
        height: 'var(--cardH, 100px)',
        borderRadius: 14,
        // Keep an outline, but remove the inner "bubble" styling.
        border: `2px solid ${border}`,
        background: faceDown ? cardBackBg : usePngFace ? '#ffffff' : faceBg,
        boxShadow: `${accentShadow}, 0 10px 24px rgba(0,0,0,0.28)`,
        display: 'grid',
        placeItems: 'center',
        padding: usePngFace ? 0 : 9,
        userSelect: 'none',

        transform: `perspective(900px) rotateY(${flip ? 180 : 0}deg)`,
        transformStyle: 'preserve-3d',
        transition: 'transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
      title={title ?? (onClick ? 'Click' : undefined)}
      aria-label={faceDown ? 'Face down card' : `Card ${card.rank}${card.suit}`}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: flip ? 'rotateY(180deg)' : 'none',
          borderRadius: 12,
          overflow: 'hidden',
          position: 'relative',
          // no inner bubble; keep a subtle inner keyline for white faces only.
          border: faceDown ? 'none' : '1px solid rgba(0,0,0,0.10)',
          boxShadow: 'none',
          display: 'grid',
          placeItems: 'stretch',
          background: faceDown ? 'transparent' : usePngFace ? '#fff' : 'transparent',
        }}
      >

        {faceDown ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              background: cardBackBg,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {/*
              Use the provided backLogo as a MASK, not as an image.
              This removes any baked-in rectangle/background from the PNG and guarantees a clean cutout.
            */}
            {/* Use the Ape Church logo as a clean centered mark (no noisy card-back texture). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backLogo}
              alt="Ape Church"
              style={{
                width: '70%',
                height: '70%',
                objectFit: 'contain',
                opacity: 0.95,
                filter:
                  'drop-shadow(0 2px 2px rgba(0,0,0,0.85)) drop-shadow(0 14px 22px rgba(0,0,0,0.55))',
              }}
            />
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%', padding: 0 }}>
            {/* corner indices (only when using fallback rendering; never on Joker PNG) */}
            {!faceSrc && !isJoker ? (
              <>
                <div
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: 9,
                    display: 'grid',
                    gap: 2,
                    color: card.suit === 'J' ? 'var(--ac-green)' : text,
                    fontWeight: 950,
                    lineHeight: 1,
                  }}
                >
                  <div style={{ fontSize: 13 }}>{rankLabel(card.rank)}</div>
                  <div style={{ fontSize: 13 }}>{suitSymbol(card.suit)}</div>
                </div>

                <div
                  style={{
                    position: 'absolute',
                    right: 10,
                    bottom: 9,
                    display: 'grid',
                    gap: 2,
                    color: card.suit === 'J' ? 'var(--ac-green)' : text,
                    fontWeight: 950,
                    lineHeight: 1,
                    transform: 'rotate(180deg)',
                  }}
                >
                  <div style={{ fontSize: 13 }}>{rankLabel(card.rank)}</div>
                  <div style={{ fontSize: 13 }}>{suitSymbol(card.suit)}</div>
                </div>
              </>
            ) : null}

            {/* center face */}
            <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
              {(() => {
                if (isJoker) {
                  return (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={jokerCard}
                        alt="Joker"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: '50% 50%',
                          // Joker has text baked into the PNG; keep it big but safe inside rounded corners.
                          padding: 6,
                          margin: 'auto',
                          boxSizing: 'border-box',
                        }}
                      />
                    </>
                  )
                }

                if (faceSrc) {
                  return (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={faceSrc}
                        alt={`${card.rank}${card.suit}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: '50% 50%',
                          // keep within rounded corners; never crop edges
                          padding: 4,
                          margin: 'auto',
                          boxSizing: 'border-box',
                        }}
                      />
                    </>
                  )
                }

                return (
                  <span style={{ fontSize: 30, lineHeight: 1, color: text }}>
                    <Suit suit={card.suit} />
                  </span>
                )
              })()}
            </div>
          </div>
        )}
      </div>
    </button>
  )
}
