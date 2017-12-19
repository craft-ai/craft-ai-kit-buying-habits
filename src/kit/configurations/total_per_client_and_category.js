export default {
  context: {
    timezone: {
      type: 'timezone'
    },
    day: {
      type: 'day_of_week'
    },
    month: {
      type: 'month_of_year'
    },
    daysSinceLastOrder: {
      type: 'continuous'
    },
    lastOrderTotal: {
      type: 'continuous'
    },
    total: {
      type: 'continuous'
    }
  },
  output: ['total'],
  time_quantum: 24 * 60 * 60, // 24h
  learning_period: 3 * 365 * 24 * 60 * 60
};
