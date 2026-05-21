import type { Series, TimeSeriesLineChartConfig, TooltipConfig } from 'lib/hog-charts'
import type { SeriesDatum } from 'scenes/insights/InsightTooltip/insightTooltipUtils'
import {
    buildTrendsLineTimeSeriesConfig,
    buildTrendsSeries,
} from 'scenes/trends/viz/trends-line-chart/trendsChartTransforms'

import type { GoalLine as SchemaGoalLine, TrendsFilter } from '~/queries/schema/schema-general'
import type { FunnelStepWithNestedBreakdown, IntervalType } from '~/types'

import type { FunnelSeriesMeta } from '../shared/funnelSeriesMeta'

// Indexed by funnelDataLogic.indexedSteps: a FunnelStep augmented with `id` and `seriesIndex`.
export type IndexedFunnelStep = FunnelStepWithNestedBreakdown & { id: number; seriesIndex: number }

// In trends-funnel mode the API populates `data` and `days` — but the type marks them
// optional on the base FunnelStep. Normalize before handing to the trends transform so
// the produced Series's data field is never undefined.
interface NormalizedFunnelStep {
    id: string | number
    label: string | null
    data: number[]
    days?: string[]
    // Narrowed to SeriesDatum-compatible shape; see FunnelSeriesMeta for rationale.
    breakdown_value?: SeriesDatum['breakdown_value']
    order: number
}

function normalizeStep(step: IndexedFunnelStep): NormalizedFunnelStep {
    return {
        id: step.id,
        label: step.name ?? null,
        data: step.data ?? [],
        days: step.days,
        breakdown_value: step.breakdown_value as SeriesDatum['breakdown_value'],
        order: step.order,
    }
}

export interface BuildFunnelLineSeriesOpts {
    incompletenessOffsetFromEnd?: number
    getColor: (step: IndexedFunnelStep, index: number) => string
}

export function buildFunnelLineSeries(
    indexedSteps: IndexedFunnelStep[],
    opts: BuildFunnelLineSeriesOpts
): Series<FunnelSeriesMeta>[] {
    const normalized = indexedSteps.map(normalizeStep)
    return buildTrendsSeries<NormalizedFunnelStep, FunnelSeriesMeta>(normalized, {
        getColor: (_, index) => opts.getColor(indexedSteps[index], index),
        incompletenessOffsetFromEnd: opts.incompletenessOffsetFromEnd,
        buildMeta: (step) => ({
            days: step.days,
            breakdown_value: step.breakdown_value,
            order: step.order,
            label: step.label,
        }),
    })
}

export interface BuildFunnelLineConfigOpts {
    indexedSteps: IndexedFunnelStep[]
    interval?: IntervalType | null
    timezone?: string
    allDays?: string[]
    goalLines?: SchemaGoalLine[] | null
    incompletenessOffsetFromEnd?: number
    showTrendLines: boolean
    valueLabels?: TimeSeriesLineChartConfig['valueLabels']
    tooltip?: TooltipConfig
    showCrosshair?: boolean
}

// Funnel trends are always rendered with a percentage y-axis — pin trendsFilter so the
// shared trends config builder produces the right axis formatting.
const PERCENTAGE_TRENDS_FILTER: TrendsFilter = { aggregationAxisFormat: 'percentage' }

export function buildFunnelLineTimeSeriesConfig(opts: BuildFunnelLineConfigOpts): TimeSeriesLineChartConfig {
    const normalized = opts.indexedSteps.map(normalizeStep)
    return buildTrendsLineTimeSeriesConfig<NormalizedFunnelStep>({
        results: normalized,
        trendsFilter: PERCENTAGE_TRENDS_FILTER,
        isPercentStackView: false,
        isStickiness: false,
        interval: opts.interval,
        timezone: opts.timezone,
        allDays: opts.allDays,
        goalLines: opts.goalLines,
        incompletenessOffsetFromEnd: opts.incompletenessOffsetFromEnd,
        showTrendLines: opts.showTrendLines,
        valueLabels: opts.valueLabels,
        tooltip: opts.tooltip,
        showCrosshair: opts.showCrosshair,
    })
}
