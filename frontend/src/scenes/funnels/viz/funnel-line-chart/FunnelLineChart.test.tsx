import '@testing-library/jest-dom'

import { cleanup, screen, waitFor } from '@testing-library/react'

import { FEATURE_FLAGS } from 'lib/constants'
import { setupJsdom, setupSyncRaf } from 'lib/hog-charts/testing'

import {
    buildFunnelsQuery,
    chart,
    getHogChart,
    personsModal,
    renderInsight,
} from '~/test/insight-testing'

let cleanupJsdom: () => void
let cleanupRaf: () => void

beforeEach(() => {
    cleanupJsdom = setupJsdom()
    cleanupRaf = setupSyncRaf()
})

afterEach(() => {
    personsModal.cleanupAll()
    cleanupRaf()
    cleanupJsdom()
    cleanup()
})

const HOG_CHARTS_FUNNEL_FLAG = { [FEATURE_FLAGS.PRODUCT_ANALYTICS_HOG_CHARTS_FUNNEL]: true }

describe('FunnelLineChart', () => {
    describe('series rendering', () => {
        it('renders a single conversion series with percentage values in the tooltip', async () => {
            renderInsight({ query: buildFunnelsQuery(), featureFlags: HOG_CHARTS_FUNNEL_FLAG })

            const tooltip = await chart.hoverTooltip(2)

            // Tooltip rows show the literal series label ("Conversion") and a percentage value.
            expect(tooltip.element.textContent).toContain('Conversion')
            expect(tooltip.element.textContent).toMatch(/40%/)
        })

        it('renders a series per breakdown variant', async () => {
            renderInsight({
                query: buildFunnelsQuery({
                    breakdownFilter: { breakdown: 'hedgehog', breakdown_type: 'event' },
                }),
                featureFlags: HOG_CHARTS_FUNNEL_FLAG,
            })

            await waitFor(() => {
                expect(screen.getByRole('img', { name: /chart with 2 data series/i })).toBeInTheDocument()
            })
        })

        it('shows breakdown labels (not "Conversion") in the tooltip when broken down', async () => {
            renderInsight({
                query: buildFunnelsQuery({
                    breakdownFilter: { breakdown: 'hedgehog', breakdown_type: 'event' },
                }),
                featureFlags: HOG_CHARTS_FUNNEL_FLAG,
            })

            // Breakdown produces multiple series — clicking pins the tooltip so we can inspect rows.
            await chart.clickAtIndex(2)
            const tooltip = chart.getTooltip()
            expect(tooltip).not.toBeNull()
            expect(tooltip!.textContent).toContain('Spike')
            expect(tooltip!.textContent).toContain('Bramble')
            expect(tooltip!.textContent).not.toContain('Conversion')
        })
    })

    describe('click → persons modal', () => {
        it('opens the persons modal with the day-scoped actors for a single-series chart', async () => {
            renderInsight({ query: buildFunnelsQuery(), featureFlags: HOG_CHARTS_FUNNEL_FLAG })

            await chart.clickAtIndex(2)

            await waitFor(() => {
                expect(personsModal.actorNames()).toEqual([
                    'funnel-wed-a@example.com',
                    'funnel-wed-b@example.com',
                ])
            })
            // Title carries "converted on <date>" — verify the date part rendered through.
            expect(personsModal.title()).toMatch(/12 Jun/)
        })

        it('opens the persons modal scoped to the clicked breakdown row', async () => {
            renderInsight({
                query: buildFunnelsQuery({
                    breakdownFilter: { breakdown: 'hedgehog', breakdown_type: 'event' },
                }),
                featureFlags: HOG_CHARTS_FUNNEL_FLAG,
            })

            await chart.clickAtIndex(2)
            await chart.clickTooltipRow('Spike')

            await waitFor(() => {
                expect(personsModal.actorNames()).toEqual(['funnel-spike@example.com'])
            })
        })
    })

    describe('value labels overlay', () => {
        it('renders percentage value labels when showValuesOnSeries is enabled', async () => {
            renderInsight({
                query: buildFunnelsQuery({
                    funnelsFilter: {
                        // funnelsFilter overrides the default { funnelVizType: Trends } so we must
                        // restate the viz type alongside the showValuesOnSeries flag.
                        funnelVizType: buildFunnelsQuery().funnelsFilter!.funnelVizType,
                        showValuesOnSeries: true,
                    },
                }),
                featureFlags: HOG_CHARTS_FUNNEL_FLAG,
            })

            await screen.findByRole('img', { name: /chart with/i })
            await waitFor(() => {
                const labels = getHogChart().valueLabels()
                expect(labels.length).toBeGreaterThan(0)
                for (const l of labels) {
                    expect(l.text).toMatch(/%$/)
                }
            })
        })
    })

    describe('goal lines', () => {
        it('renders configured goal lines on the chart', async () => {
            renderInsight({
                query: buildFunnelsQuery({
                    funnelsFilter: {
                        funnelVizType: buildFunnelsQuery().funnelsFilter!.funnelVizType,
                        goalLines: [{ label: 'Target', value: 30, displayIfCrossed: true }],
                    },
                }),
                featureFlags: HOG_CHARTS_FUNNEL_FLAG,
            })

            await screen.findByRole('img', { name: /chart with/i })
            const lines = getHogChart().referenceLines()
            expect(lines.map((l) => l.label)).toEqual(['Target'])
        })
    })

    describe('trend lines overlay', () => {
        it('adds a trend-line series when showTrendLines is enabled', async () => {
            renderInsight({
                query: buildFunnelsQuery({
                    funnelsFilter: {
                        funnelVizType: buildFunnelsQuery().funnelsFilter!.funnelVizType,
                        showTrendLines: true,
                    },
                }),
                featureFlags: HOG_CHARTS_FUNNEL_FLAG,
            })

            // Main series + trend-line series = 2 rendered series.
            await waitFor(() => {
                expect(screen.getByRole('img', { name: /chart with 2 data series/i })).toBeInTheDocument()
            })
        })
    })

})
