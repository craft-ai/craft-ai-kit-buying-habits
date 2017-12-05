import * as CraftAi from 'craft-ai'

export type Properties = {
  timezone: CraftAi.Property.Timezone
  day: CraftAi.Property.DayOfWeek
  month: CraftAi.Property.MonthOfYear
  daysSinceLastOrder: CraftAi.Property.Continuous
  lastOrderTotal: CraftAi.Property.Continuous
  total: CraftAi.Property.Continuous
}

export type Context = CraftAi.Context<Properties>

export type ContextOperation = CraftAi.ContextOperation<Properties>

export default {
  context: {
    timezone: { type: 'timezone' },
    day: { type: 'day_of_week' },
    month: { type: 'month_of_year' },
    daysSinceLastOrder: { type: 'continuous' },
    lastOrderTotal: { type: 'continuous' },
    total: { type: 'continuous' }
  },
  output: ['total'],
  time_quantum: 24 * 60 * 60, // 24h
  learning_period: 3 * 365 * 24 * 60 * 60
} as CraftAi.Configuration<Properties>
