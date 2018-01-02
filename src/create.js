import craftai from 'craft-ai';

import destroy from './core/destroy';
import request from './core/request';
import update from './core/update';

function create(configuration) {
  const client = craftai(configuration.token);
  const { clients = {}, categories = {} } = configuration;
  const kit = {
    client,
    clients,
    categories
  };

  return {
    ...kit,
    destroy: destroy(kit),
    request: request(kit),
    update: update(kit)
  };
}

export default create;
