import * as CraftAi from 'craft-ai'

export const OUTPUT_VALUE_ORDER = 'ORDER'
export const OUTPUT_VALUE_NO_ORDER = 'NO_ORDER'

export type Properties = {
  timezone: CraftAi.Property.Timezone
  day: CraftAi.Property.DayOfMonth
  month: CraftAi.Property.MonthOfYear
  periodsSinceLastEvent: CraftAi.Property.Continuous
  // lastOrderTotal: CraftAi.Property.Continuous
  order: CraftAi.Property.Enum<Output>
}
export type Output = typeof OUTPUT_VALUE_ORDER | typeof OUTPUT_VALUE_NO_ORDER
export type Context = CraftAi.Context<Properties>
export type ContextOperation = CraftAi.ContextOperation<Properties>

export const configuration = {
  context: {
    timezone: { type: 'timezone' },
    day: { type: 'day_of_month' },
    month: { type: 'month_of_year' },
    periodsSinceLastEvent: { type: 'continuous' },
    // lastOrderTotal: { type: 'continuous' },
    order: { type: 'enum' }
  },
  output: ['order'],
  time_quantum: 7 * 24 * 60 * 60, // 1 week
  learning_period: 3 * 365 * 24 * 60 * 60,
  operations_as_events: true,
  tree_max_depth: 10,
  tree_max_operations: 600
} as CraftAi.Configuration<Properties>

export default configuration;
