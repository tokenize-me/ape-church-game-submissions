import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getGameMetadata } from '@/lib/getGameMetadata'
import StatusBadge from '@/components/shared/StatusBadge'

interface Props {
    params: Promise<{ partner: string; game: string }>
    children: React.ReactNode
}

export default async function GameLayout({ params, children }: Props) {
    const { partner, game } = await params
    const metadata = await getGameMetadata(partner, game)
    const title = metadata?.displayTitle ?? game

    // Pai Gow desktop layout wants more horizontal room (Blackjack+ style: big left square + right panel).
    // Keep all other games on the normal max-width container.
    const containerClass = game === 'pai-gow'
        ? 'w-full max-w-none mx-auto'
        : 'w-full max-w-6xl mx-auto'

    return (
        <div className={containerClass}>
            <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to all game submissions
            </Link>

            <div className="flex items-center gap-3 mb-1 sm:mb-2">
                <h1 className="text-3xl font-semibold">{title}</h1>
                {metadata?.status && <StatusBadge status={metadata.status} />}
            </div>

            {metadata?.authors && metadata.authors.length > 0 && (
                <p className="text-sm text-muted-foreground mb-4 sm:mb-6">
                    by {metadata.authors.map((a) => a.name).join(', ')}
                    {metadata.version && (
                        <span className="ml-2 text-xs text-muted-foreground/60">
                            v{metadata.version}
                        </span>
                    )}
                </p>
            )}

            {children}
        </div>
    )
}
