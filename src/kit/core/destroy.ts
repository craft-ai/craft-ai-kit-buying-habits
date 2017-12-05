import { from, fromPromise } from 'most';

import limiter from 'most-limiter';

import { Intelware } from '../../../typings/index';
import { Properties } from '../configurations/order_events_per_client_and_category';

export default function destroy(kit: Intelware.KitInternal) {
  const { client } = kit

  return () => client.listAgents()
    .then(agents => from(agents)
      .thru(limiter(1000 / 50, 10000)) // Match the rate limiting of craft ai
      .chain(agentId => fromPromise(client.deleteAgent<Properties>(agentId)))
      .drain());
}
