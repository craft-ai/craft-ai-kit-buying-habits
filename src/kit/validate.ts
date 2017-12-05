import * as _ from 'lodash';
import * as moment from 'moment-timezone';

import orderEventConfiguration from './configurations/order_events_per_client_and_category';

import { Intelware } from '../../typings/index';

interface Measure {
  clientId: string
  distance: number
  date: Date
  distanceFrom: number
  distanceTo: number
  confidence?: number
}

const timeQuantum = orderEventConfiguration.time_quantum as number;

export function validate(orders: Intelware.Type.Order[], type: string) {
  return (data: Intelware.QueryResults) => {
    const { query, results } = data;
    const { categoryId, from, to } = query;
    const measures = _(orders)
      .filter(({ articles }) => articles.some((article) => article[type] === categoryId))
      .map<Measure>((order) => {
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
      .mapValues((group) => _.sortBy(group as any, 'distance')[0] as Measure)
      .value();

    return results
      .map((result) => ({ ...measures[result.clientId], ...result } as Measure))
      .concat(_.filter(measures, ({ distance, clientId }) =>
        distance === 0 && results.every((result) => clientId !== result.clientId)));
  };
}

export function print (measure: Measure) {
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

export function formatDistance(distance: number) {
  return Math.ceil(Math.abs(distance) / timeQuantum);
}

export default validate;
