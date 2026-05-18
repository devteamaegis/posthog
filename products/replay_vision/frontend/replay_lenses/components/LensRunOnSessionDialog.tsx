import { BindLogic, useActions, useValues } from 'kea'

import { LemonButton, LemonInput, LemonModal, Spinner } from '@posthog/lemon-ui'

import { SessionRecordingPreview } from 'scenes/session-recordings/playlist/SessionRecordingPreview'
import {
    SessionRecordingPlaylistLogicProps,
    sessionRecordingsPlaylistLogic,
} from 'scenes/session-recordings/playlist/sessionRecordingsPlaylistLogic'

import { replayLensLogic } from '../replayLensLogic'

export function LensRunOnSessionDialog({ lensId, tabId }: { lensId: string; tabId: string }): JSX.Element {
    const logic = replayLensLogic({ id: lensId, tabId })
    const { runDialogOpen, runDialogSessionId, runDialogSubmitting } = useValues(logic)
    const { closeRunDialog, setRunDialogSessionId, submitRunDialog } = useActions(logic)

    return (
        <LemonModal
            isOpen={runDialogOpen}
            onClose={closeRunDialog}
            title="Run lens on a session"
            description="Pick a recent recording, or paste a session ID. The observation will appear here when the workflow finishes."
            width={720}
            footer={
                <div className="flex items-center justify-end gap-2 w-full">
                    <LemonButton
                        type="secondary"
                        onClick={closeRunDialog}
                        disabledReason={runDialogSubmitting ? 'Submitting…' : undefined}
                    >
                        Cancel
                    </LemonButton>
                    <LemonButton
                        type="primary"
                        loading={runDialogSubmitting}
                        disabledReason={
                            !runDialogSessionId.trim() ? 'Pick a recording or enter a session ID' : undefined
                        }
                        onClick={submitRunDialog}
                    >
                        Run lens
                    </LemonButton>
                </div>
            }
        >
            {runDialogOpen && (
                <RunOnSessionDialogBody
                    lensId={lensId}
                    sessionId={runDialogSessionId}
                    onSelect={setRunDialogSessionId}
                />
            )}
        </LemonModal>
    )
}

function RunOnSessionDialogBody({
    lensId,
    sessionId,
    onSelect,
}: {
    lensId: string
    sessionId: string
    onSelect: (sessionId: string) => void
}): JSX.Element {
    const playlistProps: SessionRecordingPlaylistLogicProps = {
        logicKey: `replay-vision-run-dialog-${lensId}`,
        updateSearchParams: false,
        autoPlay: false,
    }

    return (
        <div className="space-y-3">
            <LemonInput value={sessionId} onChange={onSelect} placeholder="Session ID (e.g. 01987f10-…)" fullWidth />
            <BindLogic logic={sessionRecordingsPlaylistLogic} props={playlistProps}>
                <RecordingPicker selectedSessionId={sessionId} onSelect={onSelect} />
            </BindLogic>
        </div>
    )
}

function RecordingPicker({
    selectedSessionId,
    onSelect,
}: {
    selectedSessionId: string
    onSelect: (sessionId: string) => void
}): JSX.Element {
    const { otherRecordings, sessionRecordingsResponseLoading, hasNext } = useValues(sessionRecordingsPlaylistLogic)
    const { maybeLoadSessionRecordings } = useActions(sessionRecordingsPlaylistLogic)

    const hasRecordings = otherRecordings.length > 0
    const trimmedSelection = selectedSessionId.trim()

    return (
        <div className="border rounded overflow-hidden">
            <div className="px-3 py-2 border-b bg-bg-light text-xs text-muted">Recent recordings</div>
            <div className="max-h-96 overflow-y-auto">
                {sessionRecordingsResponseLoading && !hasRecordings ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-muted">
                        <Spinner textColored />
                        <span>Loading recordings…</span>
                    </div>
                ) : !hasRecordings ? (
                    <div className="py-8 text-center text-muted text-sm">
                        No recent recordings. Paste a session ID above to run this lens on a specific session.
                    </div>
                ) : (
                    <>
                        {otherRecordings.map((recording) => (
                            <div
                                key={recording.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => onSelect(recording.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        onSelect(recording.id)
                                    }
                                }}
                                className={`border-b last:border-b-0 cursor-pointer hover:bg-bg-light ${
                                    recording.id === trimmedSelection ? 'bg-primary-highlight' : ''
                                }`}
                            >
                                <SessionRecordingPreview
                                    recording={recording}
                                    isActive={recording.id === trimmedSelection}
                                    selectable={false}
                                />
                            </div>
                        ))}
                        {hasNext && (
                            <div className="p-2">
                                <LemonButton
                                    fullWidth
                                    type="secondary"
                                    size="small"
                                    onClick={() => maybeLoadSessionRecordings('older')}
                                    loading={sessionRecordingsResponseLoading}
                                >
                                    Load more recordings
                                </LemonButton>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
