import _ from 'lodash';
import moment from 'moment-timezone';

import orderEventConfiguration from './configurations/order_events_per_client_and_category';

const timeQuantum = orderEventConfiguration.time_quantum;

export function validate(orders, type) {
  return (data) => {
    const { query, results } = data;
    const { categoryId, from, to } = query;
    const measures = _(orders)
      .filter(({ articles }) => articles.some((article) => article[type] === categoryId))
      .map((order) => {
        const timestamp = moment.tz(order.date, 'Europe/Paris').startOf('day').unix();
        const distanceFrom = timestamp - from;
        const distanceTo = timestamp - to;
        const sign = Math.sign(distanceFrom) * Math.sign(distanceTo);

        return {
          clientId: order.clientId,
          distance: sign === 1 ? (distanceTo > 0 ? distanceTo : -distanceFrom) : 0,
          date: order.date,
          distanceFrom, distanceTo
        };
      })
      .groupBy('clientId')
      .mapValues((group) => _.sortBy(group, 'distance')[0])

      .value();
    return results
      .map((result) => ({ ...measures[result.clientId], ...result }))
      .concat(_.filter(measures, ({ distance, clientId }) =>
        distance === 0 && results.every((result) => clientId !== result.clientId)));
  };
}

export function print(measure) {
  if (!measure.confidence) {
    return console.log(`  \x1b[31m⚡  ${measure.clientId} ${measure.date} (not found)\x1b[0m`);
  }

  const distance = formatDistance(measure.distance);
  const confidence = (100 * measure.confidence).toFixed(2);

  if (distance === 0) {
    return console.log(`  \x1b[32m✔️  ${measure.clientId} ${measure.date} (${confidence}%)\x1b[0m`);
  }

  console.log(`  \x1b[33m⚠️  ${measure.clientId} ${measure.date} (-${formatDistance(measure.distanceFrom)}, +${formatDistance(measure.distanceTo)}, ${confidence}%)\x1b[0m`);
}

export function formatDistance(distance) {
  return Math.ceil(Math.abs(distance) / timeQuantum);
}

export default validate;
