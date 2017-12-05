import craftai from 'craft-ai';

import { Intelware } from '../../typings/index'

import destroy from './core/destroy';
import update from './core/update';
import request from './core/request';

function create(configuration: Intelware.KitConfiguration): Intelware.Kit {
  const client = craftai(configuration.token);
  const { clients = {}, categories = {} } = configuration;
  const kit = { client, clients, categories } as Intelware.KitInternal;

  return {
    ...kit,
    destroy: destroy(kit),
    request: request(kit),
    update: update(kit)
  };
}

export default create;
