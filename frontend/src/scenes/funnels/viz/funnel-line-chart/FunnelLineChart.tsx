import { useValues } from 'kea'
import posthog from 'posthog-js'
import { useCallback, useMemo, type ErrorInfo } from 'react'

import { buildTheme } from 'lib/charts/utils/theme'
import { TimeSeriesLineChart } from 'lib/hog-charts'
import type { PointClickData, TimeSeriesLineChartConfig, TooltipConfig, TooltipContext } from 'lib/hog-charts'
import { LineGraphWrapper } from 'scenes/funnels/FunnelLineGraph'
import { insightLogic } from 'scenes/insights/insightLogic'
import type { SeriesDatum } from 'scenes/insights/InsightTooltip/insightTooltipUtils'
import { teamLogic } from 'scenes/teamLogic'
import { openPersonsModal } from 'scenes/trends/persons-modal/PersonsModal'

import { themeLogic } from '~/layout/navigation-3000/themeLogic'
import { cohortsModel } from '~/models/cohortsModel'
import type { Noun } from '~/models/groupsModel'
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

function resolveGroupTypeLabel(
    labelGroupType: 'people' | 'none' | number,
    aggregationLabel: (groupTypeIndex: number) => Noun
): string {
    if (labelGroupType === 'people') {
        return 'people'
    }
    if (labelGroupType === 'none') {
        return ''
    }
    return aggregationLabel(labelGroupType).plural
}

export function FunnelLineChart({
    inCardView,
    showPersonsModal: showPersonsModalProp = true,
}: Omit<ChartParams, 'filters'>): JSX.Element | null {
    const { isDarkModeOn } = useValues(themeLogic)
    const theme = useMemo(() => buildTheme(), [isDarkModeOn])
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
    const funnelsQuerySource = isFunnelsQuery(querySource) ? querySource : null

    const steps = useMemo(() => (indexedSteps ?? []) as IndexedFunnelStep[], [indexedSteps])
    const resolvedGroupTypeLabel = resolveGroupTypeLabel(labelGroupType, aggregationLabel)
    const labels = steps[0]?.labels ?? EMPTY_LABELS

    const series = useMemo(
        () =>
            buildFunnelLineSeries(steps, {
                incompletenessOffsetFromEnd,
                getColor: (step) => getFunnelsColor(step),
            }),
        [steps, incompletenessOffsetFromEnd, getFunnelsColor]
    )

    const chartConfig: TimeSeriesLineChartConfig = useMemo(
        () =>
            buildFunnelLineTimeSeriesConfig({
                indexedSteps: steps,
                interval,
                timezone,
                allDays: steps[0]?.days ?? [],
                goalLines,
                incompletenessOffsetFromEnd,
                showTrendLines: funnelsFilter?.showTrendLines ?? false,
                valueLabels: showValuesOnSeries ? { formatter: (value) => `${value}%` } : false,
                showCrosshair: true,
                tooltip: TOOLTIP_CONFIG,
            }),
        [
            steps,
            interval,
            timezone,
            goalLines,
            incompletenessOffsetFromEnd,
            funnelsFilter?.showTrendLines,
            showValuesOnSeries,
        ]
    )

    const clickDeps = useMemo<FunnelLineChartClickDeps>(
        () => ({
            hasPersonsModal: showPersonsModal,
            querySource: funnelsQuerySource,
            interval,
            timezone,
            weekStartDay,
            resolvedDateRange: insightData?.resolved_date_range ?? null,
            breakdownFilter,
            aggregationTargetLabel,
            cohorts: allCohorts.results,
            formatPropertyValueForDisplay,
            openPersonsModal,
        }),
        [
            showPersonsModal,
            funnelsQuerySource,
            interval,
            timezone,
            weekStartDay,
            insightData?.resolved_date_range,
            breakdownFilter,
            aggregationTargetLabel,
            allCohorts.results,
            formatPropertyValueForDisplay,
        ]
    )

    const onPointClick = useCallback(
        (clickData: PointClickData<FunnelSeriesMeta>): void => {
            if (clickData.series.meta) {
                handleFunnelLineChartClick(clickData.series.meta, clickData.dataIndex, clickDeps)
            }
        },
        [clickDeps]
    )

    const renderTooltip = useCallback(
        (ctx: TooltipContext<FunnelSeriesMeta>): JSX.Element => (
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
        ),
        [
            timezone,
            interval,
            breakdownFilter,
            insightData?.resolved_date_range,
            resolvedGroupTypeLabel,
            showPersonsModal,
            clickDeps,
        ]
    )

    if (!funnelsQuerySource) {
        return null
    }

    return (
        <LineGraphWrapper inCardView={inCardView}>
            <TimeSeriesLineChart<FunnelSeriesMeta>
                series={series}
                labels={labels}
                theme={theme}
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
