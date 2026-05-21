const POLL_INTERVAL_MS = 3000
const POLL_KEY = 'pollObservations'

interface DisposablesCache {
    disposables: {
        add: (setup: () => () => void, key?: string) => void
        dispose: (key: string) => void
    }
}

/**
 * Start or stop the recurring observation refresh. Keyed so a repeat call replaces the prior timer;
 * the kea-disposables plugin clears it on unmount and pauses it while the tab is hidden.
 */
export function scheduleObservationPoll(cache: DisposablesCache, shouldPoll: boolean, poll: () => void): void {
    if (shouldPoll) {
        cache.disposables.add(() => {
            const id = setTimeout(poll, POLL_INTERVAL_MS)
            return () => clearTimeout(id)
        }, POLL_KEY)
    } else {
        cache.disposables.dispose(POLL_KEY)
    }
}
