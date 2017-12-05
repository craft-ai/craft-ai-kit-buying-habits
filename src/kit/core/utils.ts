import * as _ from 'lodash';

import { Intelware } from '../../../typings/index';

import {
  OUTPUT_VALUE_ORDER,
  ContextOperation
} from '../configurations/order_events_per_client_and_category';

export function getLastOperation(operations: ContextOperation[], lastTimestamp: number) {
  return _.last(operations.filter(({ timestamp, context }) =>
    context.order === OUTPUT_VALUE_ORDER && timestamp <= lastTimestamp));
}

export function slugify(...strings: string[]) {
  return strings.join(' ').replace(/[^A-Za-z0-9]+/g, '-');
}
