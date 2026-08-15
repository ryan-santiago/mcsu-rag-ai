import Image from 'next/image'

import { cn } from '@/lib/utils'

const LOCKUP_SRC = '/brand/qnx-and-readthememo-lockup.png'
/** The source PNG's actual pixel size (2172×724) — callers set a height and the width follows. */
const LOCKUP_ASPECT = 2172 / 724

type QnxReadTheMemoLockupProps = {
	/** Rendered height in pixels. Width is derived from the lockup's ratio. */
	height?: number
	className?: string
	priority?: boolean
}

/**
 * The combined Questronix + ReadTheMemo lockup — shown on login/register so
 * it's clear the console is a Questronix-operated system, not just the
 * product on its own (see `AuthBrandMark`, the only caller).
 *
 * Styled the way mcsu-app's own `Logo` renders its lockup
 * (`D:\Projects 2026\mcsu-app\src\components\brand\logo.tsx`): the raw
 * asset, no card or background — just `h-auto w-auto` and an explicit
 * height, width derived from one aspect constant. mcsu-app can do this
 * card-free because it pre-generates separate colour/white cuts via
 * `scripts/build-brand-assets.mjs`; this lockup is a single asset, so it
 * depends on the auth brand panel's background being close enough to what
 * the artwork was designed against.
 */
export function QnxReadTheMemoLockup({
	height = 48,
	className,
	priority,
}: QnxReadTheMemoLockupProps) {
	return (
		<Image
			src={LOCKUP_SRC}
			alt="Questronix Corporation and ReadTheMemo"
			width={Math.round(height * LOCKUP_ASPECT)}
			height={height}
			priority={priority}
			className={cn('h-auto w-auto select-none', className)}
			style={{ height }}
		/>
	)
}
