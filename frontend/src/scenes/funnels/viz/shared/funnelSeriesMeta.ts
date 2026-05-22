import type { SeriesDatum } from 'scenes/insights/InsightTooltip/insightTooltipUtils'

// Series label shown in the tooltip when a funnel trends chart is not broken down.
export const FUNNEL_CONVERSION_SERIES_LABEL = 'Conversion'

export type FunnelSeriesMeta = {
    days?: string[]
    // Narrower than BreakdownKeyType — aligned with SeriesDatum so the tooltip adapter
    // doesn't need a cast. Funnel breakdown values come back as scalars or string arrays
    // (the `null` and integer-array cases of BreakdownKeyType don't occur in funnel
    // trends responses).
    breakdown_value?: SeriesDatum['breakdown_value']
    order: number
    label?: string | null
}
