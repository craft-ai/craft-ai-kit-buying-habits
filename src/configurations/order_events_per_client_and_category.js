export const OUTPUT_VALUE_ORDER = 'ORDER';
export const OUTPUT_VALUE_NO_ORDER = 'NO_ORDER';

export const configuration = {
  context: {
    timezone: {
      type: 'timezone'
    },
    day: {
      type: 'day_of_month'
    },
    month: {
      type: 'month_of_year'
    },
    periodsSinceLastEvent: { // Number of time quantums since the last order
      type: 'continuous'
    },
    // lastOrderTotal: { type: 'continuous' },
    order: {
      type: 'enum'
    }
  },
  output: ['order'],
  time_quantum: 7 * 24 * 60 * 60, // 1 week
  learning_period: 3 * 365 * 24 * 60 * 60,
  operations_as_events: true,
  tree_max_depth: 10,
  tree_max_operations: 600
};

export default configuration;
