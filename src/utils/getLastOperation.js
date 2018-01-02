import _ from 'lodash';

import {
  OUTPUT_VALUE_ORDER
} from '../configurations/order_events_per_client_and_category';

export default function getLastOperation(operations, lastTimestamp) {
  return _.last(operations.filter(({ timestamp, context }) =>
    context.order === OUTPUT_VALUE_ORDER && timestamp <= lastTimestamp));
}
