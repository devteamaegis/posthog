import { actions, afterMount, kea, key, listeners, path, props, reducers, selectors } from 'kea'

import { lemonToast } from 'lib/lemon-ui/LemonToast'
import { teamLogic } from 'scenes/teamLogic'

import { visionLensesList, visionLensesObserveCreate, visionObservationsList } from '../generated/api'
import type { ReplayLensApi, ReplayObservationApi } from '../generated/api.schemas'
import type { observationsDockLogicType } from './observationsDockLogicType'

const POLL_INTERVAL_MS = 3000

export interface ObservationsDockLogicProps {
    sessionId: string
}

export const observationsDockLogic = kea<observationsDockLogicType>([
    path(['products', 'replay_vision', 'frontend', 'logics', 'observationsDockLogic']),
    props({} as ObservationsDockLogicProps),
    key((props) => props.sessionId),

    actions({
        loadObservations: true,
        loadObservationsSuccess: (observations: ReplayObservationApi[]) => ({ observations }),
        loadObservationsFailure: true,
        loadLenses: true,
        loadLensesSuccess: (lenses: ReplayLensApi[]) => ({ lenses }),
        loadLensesFailure: true,
        observe: (lensId: string) => ({ lensId }),
        observeSuccess: true,
        observeFailure: true,
        setDockOpen: (open: boolean) => ({ open }),
        setLensPickerOpen: (open: boolean) => ({ open }),
        setLensSearch: (search: string) => ({ search }),
    }),

    reducers({
        observations: [
            [] as ReplayObservationApi[],
            {
                loadObservationsSuccess: (_, { observations }) => observations,
            },
        ],
        observationsLoading: [
            false,
            {
                loadObservations: () => true,
                loadObservationsSuccess: () => false,
                loadObservationsFailure: () => false,
            },
        ],
        lenses: [
            [] as ReplayLensApi[],
            {
                loadLensesSuccess: (_, { lenses }) => lenses,
            },
        ],
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
        loadObservations: async () => {
            const teamId = teamLogic.values.currentTeamId
            if (!teamId) {
                return
            }
            try {
                const response = await visionObservationsList(String(teamId), { session_id: props.sessionId })
                actions.loadObservationsSuccess(response.results ?? [])
            } catch {
                actions.loadObservationsFailure()
            }
        },

        loadObservationsSuccess: () => {
            if (values.hasObservationsInFlight) {
                cache.disposables.add(() => {
                    const id = setTimeout(() => actions.loadObservations(), POLL_INTERVAL_MS)
                    return () => clearTimeout(id)
                }, 'pollObservations')
            } else {
                cache.disposables.dispose('pollObservations')
            }
        },

        loadLenses: async () => {
            const teamId = teamLogic.values.currentTeamId
            if (!teamId) {
                return
            }
            try {
                const response = await visionLensesList(String(teamId))
                actions.loadLensesSuccess(response.results ?? [])
            } catch {
                actions.loadLensesFailure()
            }
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
