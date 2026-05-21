import { useValues } from 'kea'
import posthog from 'posthog-js'
import { useMemo, type ErrorInfo } from 'react'

import { buildTheme } from 'lib/charts/utils/theme'
import { TimeSeriesLineChart } from 'lib/hog-charts'
import type { PointClickData, TimeSeriesLineChartConfig, TooltipConfig, TooltipContext } from 'lib/hog-charts'
import { insightLogic } from 'scenes/insights/insightLogic'
import type { SeriesDatum } from 'scenes/insights/InsightTooltip/insightTooltipUtils'
import { teamLogic } from 'scenes/teamLogic'
import { openPersonsModal } from 'scenes/trends/persons-modal/PersonsModal'

import { cohortsModel } from '~/models/cohortsModel'
import { groupsModel } from '~/models/groupsModel'
import { propertyDefinitionsModel } from '~/models/propertyDefinitionsModel'
import { isFunnelsQuery } from '~/queries/utils'
import { ChartParams } from '~/types'

import { funnelDataLogic } from '../../funnelDataLogic'
import { funnelPersonsModalLogic } from '../../funnelPersonsModalLogic'
import type { FunnelSeriesMeta } from '../shared/funnelSeriesMeta'
import { buildFunnelLineSeries, buildFunnelLineTimeSeriesConfig, type IndexedFunnelStep } from './funnelChartTransforms'
import { FunnelLineTooltip } from './FunnelLineTooltip'
import { type FunnelLineChartClickDeps, handleFunnelLineChartClick } from './handleFunnelLineChartClick'

const TOOLTIP_CONFIG: TooltipConfig = { pinnable: true, placement: 'top' }
const EMPTY_LABELS: string[] = []

const handleChartError = (error: Error, info: ErrorInfo): void => {
    posthog.captureException(error, {
        feature: 'funnels-line-chart',
        componentStack: info.componentStack ?? undefined,
    })
}

const LineGraphWrapper = ({ inCardView, children }: { inCardView?: boolean; children: JSX.Element }): JSX.Element => {
    if (inCardView) {
        return <>{children}</>
    }
    return <div className="TrendsInsight">{children}</div>
}

export function FunnelLineChart({
    inCardView,
    showPersonsModal: showPersonsModalProp = true,
}: Omit<ChartParams, 'filters'>): JSX.Element | null {
    const { insightProps } = useValues(insightLogic)

    const {
        indexedSteps,
        goalLines,
        aggregationTargetLabel,
        incompletenessOffsetFromEnd,
        querySource,
        interval,
        insightData,
        showValuesOnSeries,
        funnelsFilter,
        breakdownFilter,
        labelGroupType,
        getFunnelsColor,
    } = useValues(funnelDataLogic(insightProps))
    const { canOpenPersonModal } = useValues(funnelPersonsModalLogic(insightProps))
    const { timezone, weekStartDay } = useValues(teamLogic)
    const { allCohorts } = useValues(cohortsModel)
    const { formatPropertyValueForDisplay } = useValues(propertyDefinitionsModel)
    const { aggregationLabel } = useValues(groupsModel)

    const showPersonsModal = canOpenPersonModal && showPersonsModalProp

    const series = useMemo(
        () =>
            buildFunnelLineSeries(indexedSteps as IndexedFunnelStep[], {
                incompletenessOffsetFromEnd,
                getColor: (step) => getFunnelsColor(step),
            }),
        [indexedSteps, incompletenessOffsetFromEnd, getFunnelsColor]
    )

    const chartConfig: TimeSeriesLineChartConfig = useMemo(
        () =>
            buildFunnelLineTimeSeriesConfig({
                indexedSteps: indexedSteps as IndexedFunnelStep[],
                interval,
                timezone,
                allDays: (indexedSteps?.[0] as IndexedFunnelStep | undefined)?.days ?? [],
                goalLines,
                incompletenessOffsetFromEnd,
                showTrendLines: funnelsFilter?.showTrendLines ?? false,
                valueLabels: showValuesOnSeries ? { formatter: (value) => `${value}%` } : false,
                showCrosshair: true,
                tooltip: TOOLTIP_CONFIG,
            }),
        [
            indexedSteps,
            interval,
            timezone,
            goalLines,
            incompletenessOffsetFromEnd,
            funnelsFilter?.showTrendLines,
            showValuesOnSeries,
        ]
    )

    if (!isFunnelsQuery(querySource)) {
        return null
    }

    const resolvedGroupTypeLabel =
        labelGroupType === 'people'
            ? 'people'
            : labelGroupType === 'none'
              ? ''
              : aggregationLabel(labelGroupType).plural

    const labels = (indexedSteps?.[0] as IndexedFunnelStep | undefined)?.labels ?? EMPTY_LABELS

    const clickDeps: FunnelLineChartClickDeps = {
        hasPersonsModal: showPersonsModal,
        querySource,
        interval,
        timezone,
        weekStartDay,
        resolvedDateRange: insightData?.resolved_date_range ?? null,
        breakdownFilter,
        aggregationTargetLabel,
        cohorts: allCohorts.results,
        formatPropertyValueForDisplay,
        openPersonsModal,
    }

    const onPointClick = (clickData: PointClickData<FunnelSeriesMeta>): void => {
        if (clickData.series.meta) {
            handleFunnelLineChartClick(clickData.series.meta, clickData.dataIndex, clickDeps)
        }
    }

    const renderTooltip = (ctx: TooltipContext<FunnelSeriesMeta>): JSX.Element => (
        <FunnelLineTooltip
            context={ctx}
            timezone={timezone}
            interval={interval ?? undefined}
            breakdownFilter={breakdownFilter ?? undefined}
            dateRange={insightData?.resolved_date_range ?? undefined}
            groupTypeLabel={resolvedGroupTypeLabel}
            onRowClick={
                showPersonsModal
                    ? (datum: SeriesDatum) => {
                          const meta = ctx.seriesData[datum.datasetIndex]?.series.meta
                          if (meta) {
                              handleFunnelLineChartClick(meta, datum.dataIndex, clickDeps)
                          }
                      }
                    : undefined
            }
        />
    )

    return (
        <LineGraphWrapper inCardView={inCardView}>
            <TimeSeriesLineChart<FunnelSeriesMeta>
                series={series}
                labels={labels}
                theme={buildTheme()}
                config={chartConfig}
                tooltip={renderTooltip}
                onPointClick={showPersonsModal ? onPointClick : undefined}
                className="LineGraph"
                dataAttr="trend-line-graph-funnel"
                onError={handleChartError}
            />
        </LineGraphWrapper>
    )
}
