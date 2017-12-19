import { from, fromPromise } from 'most';

import limiter from 'most-limiter';

export default function destroy(kit) {
  const { client } = kit;

  return () => client.listAgents()
    .then((agents) => from(agents)
      .thru(limiter(1000 / 50, 10000)) // Match the rate limiting of craft ai
      .chain((agentId) => fromPromise(client.deleteAgent(agentId)))
      .drain());
}
