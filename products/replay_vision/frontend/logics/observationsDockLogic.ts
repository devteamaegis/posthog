import { actions, afterMount, kea, key, listeners, path, props, reducers, selectors } from 'kea'
import { loaders } from 'kea-loaders'

import { lemonToast } from 'lib/lemon-ui/LemonToast'
import { teamLogic } from 'scenes/teamLogic'

import { visionLensesList, visionLensesObserveCreate, visionObservationsList } from '../generated/api'
import type { ReplayLensApi, ReplayObservationApi } from '../generated/api.schemas'
import { scheduleObservationPoll } from './observationPolling'
import type { observationsDockLogicType } from './observationsDockLogicType'

// The observe endpoint only starts the workflow; its row is created a moment later. Keep polling
// for this window after an observe so the new card appears even before anything reports in flight.
const OBSERVE_POLL_GRACE_MS = 30000

export interface ObservationsDockLogicProps {
    sessionId: string
}

export const observationsDockLogic = kea<observationsDockLogicType>([
    path(['products', 'replay_vision', 'frontend', 'logics', 'observationsDockLogic']),
    props({} as ObservationsDockLogicProps),
    key((props) => props.sessionId),

    actions({
        observe: (lensId: string) => ({ lensId }),
        observeSuccess: true,
        observeFailure: true,
        setDockOpen: (open: boolean) => ({ open }),
        setLensPickerOpen: (open: boolean) => ({ open }),
        setLensSearch: (search: string) => ({ search }),
    }),

    loaders(({ props }) => ({
        observations: [
            [] as ReplayObservationApi[],
            {
                loadObservations: async () => {
                    const teamId = teamLogic.values.currentTeamId
                    if (!teamId) {
                        return []
                    }
                    const response = await visionObservationsList(String(teamId), { session_id: props.sessionId })
                    return response.results ?? []
                },
            },
        ],
        lenses: [
            [] as ReplayLensApi[],
            {
                loadLenses: async () => {
                    const teamId = teamLogic.values.currentTeamId
                    if (!teamId) {
                        return []
                    }
                    const response = await visionLensesList(String(teamId))
                    return response.results ?? []
                },
            },
        ],
    })),

    reducers({
        observing: [
            false,
            {
                observe: () => true,
                observeSuccess: () => false,
                observeFailure: () => false,
            },
        ],
        dockOpen: [
            false,
            {
                setDockOpen: (_, { open }) => open,
            },
        ],
        lensPickerOpen: [
            false,
            {
                setLensPickerOpen: (_, { open }) => open,
            },
        ],
        lensSearch: [
            '',
            {
                setLensSearch: (_, { search }) => search,
                // Reset the query each time the picker is opened or closed.
                setLensPickerOpen: () => '',
            },
        ],
        pollUntil: [
            0,
            {
                observeSuccess: () => Date.now() + OBSERVE_POLL_GRACE_MS,
            },
        ],
    }),

    selectors({
        hasObservationsInFlight: [
            (s) => [s.observations],
            (observations: ReplayObservationApi[]): boolean =>
                observations.some((o) => o.status === 'pending' || o.status === 'running'),
        ],
        filteredLenses: [
            (s) => [s.lenses, s.lensSearch],
            (lenses: ReplayLensApi[], lensSearch: string): ReplayLensApi[] => {
                const query = lensSearch.trim().toLowerCase()
                return query ? lenses.filter((lens) => lens.name.toLowerCase().includes(query)) : lenses
            },
        ],
    }),

    listeners(({ actions, props, values, cache }) => ({
        loadObservationsSuccess: () => {
            // Poll while work is in flight, and through the grace window after an observe.
            scheduleObservationPoll(
                cache,
                values.hasObservationsInFlight || Date.now() < values.pollUntil,
                actions.loadObservations
            )
        },

        observe: async ({ lensId }) => {
            actions.setLensPickerOpen(false)
            const teamId = teamLogic.values.currentTeamId
            if (!teamId) {
                actions.observeFailure()
                return
            }
            try {
                await visionLensesObserveCreate(String(teamId), lensId, { session_id: props.sessionId })
                lemonToast.success('Observation started')
                actions.observeSuccess()
                actions.setDockOpen(true)
                actions.loadObservations()
            } catch (error) {
                lemonToast.error(`Failed to start observation: ${String(error)}`)
                actions.observeFailure()
            }
        },
    })),

    afterMount(({ actions }) => {
        actions.loadObservations()
        actions.loadLenses()
    }),
])
