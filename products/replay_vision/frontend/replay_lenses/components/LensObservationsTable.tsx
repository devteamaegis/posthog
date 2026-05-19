import { useActions, useValues } from 'kea'

import { IconPlay, IconRefresh, IconWarning } from '@posthog/icons'
import { LemonButton, LemonTable, LemonTag, Link, Spinner, Tooltip } from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { LemonTableColumns } from 'lib/lemon-ui/LemonTable'
import { urls } from 'scenes/urls'

import { replayLensLogic } from '../replayLensLogic'
import { LensType, ObservationStatus, ReplayObservation } from '../types'
import { LensRunOnSessionDialog } from './LensRunOnSessionDialog'

function StatusTag({ status }: { status: ObservationStatus }): JSX.Element {
    if (status === 'succeeded') {
        return <LemonTag type="success">Succeeded</LemonTag>
    }
    if (status === 'failed') {
        return <LemonTag type="danger">Failed</LemonTag>
    }
    if (status === 'running') {
        return (
            <LemonTag type="warning">
                <Spinner className="mr-1" /> Running
            </LemonTag>
        )
    }
    return <LemonTag type="default">Pending</LemonTag>
}

function ResultPreview({ lensType, observation }: { lensType: LensType; observation: ReplayObservation }): JSX.Element {
    if (observation.status === 'failed') {
        return (
            <Tooltip title={observation.error_reason || 'Unknown error'}>
                <span className="inline-flex items-center gap-1 text-danger text-sm">
                    <IconWarning /> {observation.error_reason || 'Failed'}
                </span>
            </Tooltip>
        )
    }
    if (observation.status !== 'succeeded' || !observation.result) {
        return <span className="text-muted text-sm">—</span>
    }
    const r = observation.result
    if (lensType === 'monitor') {
        const verdict = Boolean(r.verdict)
        return (
            <div className="flex flex-col gap-1 max-w-md">
                <LemonTag type={verdict ? 'success' : 'default'}>{verdict ? 'Yes' : 'No'}</LemonTag>
                {typeof r.reasoning === 'string' && <span className="text-muted text-xs truncate">{r.reasoning}</span>}
            </div>
        )
    }
    if (lensType === 'summarizer') {
        return (
            <div className="flex flex-col max-w-md">
                {typeof r.title === 'string' && <span className="font-semibold text-sm truncate">{r.title}</span>}
                {typeof r.summary === 'string' && <span className="text-muted text-xs line-clamp-2">{r.summary}</span>}
            </div>
        )
    }
    if (lensType === 'classifier') {
        const tags = Array.isArray(r.tags) ? (r.tags as string[]) : []
        return (
            <div className="flex flex-wrap gap-1 max-w-md">
                {tags.length === 0 ? (
                    <span className="text-muted text-sm">No tags</span>
                ) : (
                    tags.map((t) => (
                        <LemonTag key={t} type="option">
                            {t}
                        </LemonTag>
                    ))
                )}
            </div>
        )
    }
    if (lensType === 'scorer') {
        const score = typeof r.score === 'number' ? r.score : null
        const label = typeof r.label === 'string' ? r.label : null
        return (
            <div className="flex items-baseline gap-2">
                <span className="font-semibold text-lg tabular-nums">{score ?? '—'}</span>
                {label && <span className="text-muted text-xs">{label}</span>}
            </div>
        )
    }
    if (lensType === 'indexer') {
        const keywords = Array.isArray(r.keywords) ? (r.keywords as string[]) : []
        return (
            <div className="flex flex-col max-w-md">
                {typeof r.summary === 'string' && <span className="text-sm truncate">{r.summary}</span>}
                {keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {keywords.slice(0, 5).map((k) => (
                            <LemonTag key={k} type="option" size="small">
                                {k}
                            </LemonTag>
                        ))}
                        {keywords.length > 5 && <span className="text-muted text-xs">+{keywords.length - 5}</span>}
                    </div>
                )}
            </div>
        )
    }
    return <span className="text-muted text-sm">—</span>
}

function ObservationDetail({ observation }: { observation: ReplayObservation }): JSX.Element {
    const snapshot = observation.lens_config_snapshot ?? {}
    const promptSnapshot = typeof snapshot.prompt === 'string' ? snapshot.prompt : null
    const { prompt: _omitPrompt, ...snapshotRest } = snapshot
    const hasSnapshotRest = Object.keys(snapshotRest).length > 0
    const durationMs =
        observation.started_at && observation.completed_at
            ? new Date(observation.completed_at).getTime() - new Date(observation.started_at).getTime()
            : null

    return (
        <div className="p-4 bg-bg-light space-y-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
                <div>
                    <div className="font-medium text-default">Model</div>
                    <span className="font-mono">{observation.model_used || '—'}</span>
                </div>
                <div>
                    <div className="font-medium text-default">Provider</div>
                    <span className="font-mono">{observation.provider_used || '—'}</span>
                </div>
                <div>
                    <div className="font-medium text-default">Lens version</div>v{observation.lens_version}
                </div>
                <div>
                    <div className="font-medium text-default">Workflow ID</div>
                    <span className="font-mono">{observation.workflow_id || '—'}</span>
                </div>
                {durationMs !== null && (
                    <div>
                        <div className="font-medium text-default">Run time</div>
                        {(durationMs / 1000).toFixed(1)}s
                    </div>
                )}
                <div>
                    <Link to={urls.replaySingle(observation.session_id)}>Open recording →</Link>
                </div>
            </div>

            {observation.status === 'failed' && observation.error_reason && (
                <div>
                    <div className="text-sm font-semibold mb-1 text-danger">Failure reason</div>
                    <pre className="bg-bg-3000 border rounded p-2 text-xs whitespace-pre-wrap break-words m-0">
                        {observation.error_reason}
                    </pre>
                </div>
            )}

            {observation.status === 'succeeded' && observation.result && (
                <div>
                    <div className="text-sm font-semibold mb-1">Result</div>
                    <pre className="bg-bg-3000 border rounded p-2 text-xs whitespace-pre-wrap break-words m-0 max-h-96 overflow-y-auto">
                        {JSON.stringify(observation.result, null, 2)}
                    </pre>
                </div>
            )}

            {promptSnapshot && (
                <div>
                    <div className="text-sm font-semibold mb-1">Prompt at run time</div>
                    <pre className="bg-bg-3000 border rounded p-2 text-xs whitespace-pre-wrap break-words m-0">
                        {promptSnapshot}
                    </pre>
                </div>
            )}

            {hasSnapshotRest && (
                <div>
                    <div className="text-sm font-semibold mb-1">Lens config at run time</div>
                    <pre className="bg-bg-3000 border rounded p-2 text-xs whitespace-pre-wrap break-words m-0">
                        {JSON.stringify(snapshotRest, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    )
}

export function LensObservationsTable({ lensId, tabId }: { lensId: string; tabId: string }): JSX.Element {
    const logic = replayLensLogic({ id: lensId, tabId })
    const { lens, observations, observationsLoading, hasUnsavedChanges, hasObservationsInFlight } = useValues(logic)
    const { loadObservations, openRunDialog } = useActions(logic)

    if (!lens) {
        return <div className="text-muted">Loading…</div>
    }

    const stats = observations.reduce(
        (acc, o) => {
            acc.total += 1
            if (o.status === 'succeeded') {
                acc.succeeded += 1
            } else if (o.status === 'failed') {
                acc.failed += 1
            } else {
                acc.inFlight += 1
            }
            return acc
        },
        { total: 0, succeeded: 0, failed: 0, inFlight: 0 }
    )
    const completed = stats.succeeded + stats.failed
    const successRate = completed > 0 ? Math.round((stats.succeeded / completed) * 100) : null

    const columns: LemonTableColumns<ReplayObservation> = [
        {
            title: 'Session',
            key: 'session',
            width: 300,
            render: (_, obs) => (
                <Link to={urls.replaySingle(obs.session_id)} className="font-mono text-xs text-primary truncate block">
                    {obs.session_id}
                </Link>
            ),
        },
        {
            title: 'Status',
            key: 'status',
            render: (_, obs) => <StatusTag status={obs.status} />,
        },
        {
            title: 'Result',
            key: 'result',
            render: (_, obs) => <ResultPreview lensType={lens.lens_type} observation={obs} />,
        },
        {
            title: 'Triggered by',
            key: 'triggered_by',
            render: (_, obs) => (
                <LemonTag type={obs.triggered_by === 'on_demand' ? 'highlight' : 'default'}>
                    {obs.triggered_by === 'on_demand' ? 'On demand' : 'Schedule'}
                </LemonTag>
            ),
        },
        {
            title: 'Model',
            key: 'model',
            render: (_, obs) => <span className="font-mono text-xs text-muted">{obs.model_used || '—'}</span>,
        },
        {
            title: 'Created',
            key: 'created_at',
            render: (_, obs) => <TZLabel time={obs.created_at} />,
            sorter: (a, b) => a.created_at.localeCompare(b.created_at),
        },
    ]

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-start justify-between gap-4">
                <p className="text-muted text-sm m-0">
                    Past applications of this lens to session recordings. Each row is one observation.
                </p>
                <div className="flex items-center gap-4">
                    {stats.total > 0 && (
                        <div className="flex gap-4 text-sm">
                            <div className="text-center">
                                <div className="font-semibold text-lg">{stats.total}</div>
                                <div className="text-muted">Total</div>
                            </div>
                            {successRate !== null && (
                                <div className="text-center">
                                    <div className="font-semibold text-lg text-success">{successRate}%</div>
                                    <div className="text-muted">Success rate</div>
                                </div>
                            )}
                            {stats.failed > 0 && (
                                <div className="text-center">
                                    <div className="font-semibold text-lg text-danger">{stats.failed}</div>
                                    <div className="text-muted">Failed</div>
                                </div>
                            )}
                            {stats.inFlight > 0 && (
                                <div className="text-center">
                                    <div className="font-semibold text-lg">{stats.inFlight}</div>
                                    <div className="text-muted">In flight</div>
                                </div>
                            )}
                        </div>
                    )}
                    <Tooltip
                        title={
                            hasObservationsInFlight
                                ? 'Auto-refreshing while observations are in flight'
                                : 'Refresh observations'
                        }
                    >
                        <LemonButton
                            size="small"
                            type="secondary"
                            icon={<IconRefresh />}
                            onClick={() => loadObservations()}
                            loading={observationsLoading}
                        >
                            Refresh
                        </LemonButton>
                    </Tooltip>
                    <LemonButton
                        size="small"
                        type="primary"
                        icon={<IconPlay />}
                        onClick={() => openRunDialog()}
                        disabledReason={hasUnsavedChanges ? 'Save your changes before running this lens' : undefined}
                    >
                        Run on a session
                    </LemonButton>
                </div>
            </div>
            <LemonTable
                columns={columns}
                dataSource={observations}
                loading={observationsLoading}
                rowKey="id"
                pagination={{ pageSize: 50 }}
                nouns={['observation', 'observations']}
                expandable={{
                    rowExpandable: (obs) => obs.status === 'succeeded' || obs.status === 'failed',
                    expandedRowRender: (obs) => <ObservationDetail observation={obs} />,
                }}
                emptyState={
                    <div className="flex flex-col items-center gap-3 p-6 text-center">
                        <span className="text-muted">
                            No observations yet. Try running this lens on a specific recording.
                        </span>
                        <LemonButton
                            type="primary"
                            icon={<IconPlay />}
                            onClick={() => openRunDialog()}
                            disabledReason={
                                hasUnsavedChanges ? 'Save your changes before running this lens' : undefined
                            }
                        >
                            Run on a session
                        </LemonButton>
                    </div>
                }
            />
            <LensRunOnSessionDialog lensId={lensId} tabId={tabId} />
        </div>
    )
}
