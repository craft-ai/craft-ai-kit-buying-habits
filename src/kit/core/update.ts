import * as _ from 'lodash';
import * as moment from 'moment-timezone';

import buffer from 'most-buffer';
import debug from 'debug';
import limiter from 'most-limiter';

import { Time } from 'craft-ai';
import { Stream, empty, from, fromPromise, just } from 'most';

import sample from '../../utils/most-sample'

import { Intelware } from '../../../typings/index';
import { slugify } from './utils';

import orderEventConfiguration, {
  OUTPUT_VALUE_NO_ORDER,
  OUTPUT_VALUE_ORDER,
  Context,
  ContextOperation,
  Properties,
  Output
} from '../configurations/order_events_per_client_and_category'

interface Agent {
  id: string
  clientId: string
  categoryId: string
  brand: string
  nbOrders: number
  latestOperation?: ContextOperation
}

const timeQuantum = orderEventConfiguration.time_quantum as number;
const log = debug('craft-ai:kit-buying-habits');

function retrieveBrandAgents(kit: Intelware.KitInternal) {
  const { client } = kit;

  return (ordersStream: Stream<Intelware.Type.Order>) => {
    // Make sure the needed agents do exist
    const clientsMarkPromise = ordersStream
      .reduce((clientsMarks, { clientId, date, articles }) => {
        let ordersArticlesConstructor = [] as string[];
        _.map(articles, ({ brand }) => {
          const id = slugify(clientId, brand);
          if (clientsMarks[id]) {
            if (!ordersArticlesConstructor.includes(brand)) {
              clientsMarks[id].nbOrders++;
              ordersArticlesConstructor.push(brand);
            }
          }
          else {
            clientsMarks[id] = {
              id: id,
              nbOrders: 1,
              clientId, brand
            };
            ordersArticlesConstructor.push(brand);
          }
        });
        return clientsMarks;
      }, {})
      .then((clientsMarks) => _.values(clientsMarks));

    return fromPromise(clientsMarkPromise)
      .chain((clientsMark) => from(clientsMark))
      // Filter < 2 operations agent
      .filter((agent: Agent) => agent.nbOrders >= 2)
      // Match the rate limiting of craft ai (2 requests per agent)
      .thru(limiter(1000 / 50 * 2, 10000))
      .chain((agent: Agent) => {
        const { id } = agent;

        return fromPromise(client
          .getAgent(id)
          .then(({ lastTimestamp }) => lastTimestamp
            ? client
              .getAgentContext<Properties>(id, lastTimestamp)
              .then((latestOperation) => {
                delete latestOperation.context.day;
                delete latestOperation.context.month;

                return { ...agent, latestOperation };
              })
            : Promise.resolve(agent))
          .catch((error) => {
            if (error.message.includes('[NotFound]')) {
              return client
                .createAgent(orderEventConfiguration, id)
                .then(() => agent)
            }

            return Promise.reject(error);
          }));
    });
  };
}

function retrieveCategoryAgents(kit: Intelware.KitInternal) {
  const { client } = kit;

  return (ordersStream: Stream<Intelware.Type.Order>) => {
    // Make sure the needed agents do exist
    const clientsCategoriesPromise = ordersStream
      .reduce((clientsCategories, { clientId, date, articles }) => {
        let ordersArticlesCat = [] as string[];
        _.map(articles, ({ categoryId }) => {
          const id = slugify(clientId, categoryId);
          if (clientsCategories[id]) {
            if (!ordersArticlesCat.includes(categoryId)) {
              clientsCategories[id].nbOrders++;
              ordersArticlesCat.push(categoryId);
            }
          }
          else {
            clientsCategories[id] = {
              id: id,
              nbOrders: 1,
              clientId, categoryId,
            };
            ordersArticlesCat.push(categoryId);
          }
        });
        return clientsCategories;
      }, {})
      .then((clientsCategoriesObj) => _.values(clientsCategoriesObj));

    return fromPromise(clientsCategoriesPromise)
      .chain((clientsCategories) => from(clientsCategories))
      // Filter < 2 operations agent
      .filter((agent: Agent) => agent.nbOrders >= 2)
      // Match the rate limiting of craft ai (2 requests per agent)
      .thru(limiter(1000 / 50 * 2, 10000))
      .chain((agent: Agent) => {
        const { id } = agent;

        return fromPromise(client
          .getAgent(id)
          .then(({ lastTimestamp }) => lastTimestamp
            ? client
              .getAgentContext<Properties>(id, lastTimestamp)
              .then((latestOperation) => {
                delete latestOperation.context.day;
                delete latestOperation.context.month;

                return { ...agent, latestOperation };
              })
            : Promise.resolve(agent))
          .catch((error) => {
            if (error.message.includes('[NotFound]')) {
              return client
                .createAgent(orderEventConfiguration, id)
                .then(() => agent)
            }

            return Promise.reject(error);
          }));
    });
  };
}

function addOperations(kit: Intelware.KitInternal, agent: Agent, type: string) {
  const { client } = kit;

  return (ordersStream: Stream<Intelware.Type.Order>) => {
    const { id, clientId, categoryId, brand, latestOperation = null } = agent;

    return ordersStream
      .filter((order) => order.clientId === clientId)
      .filter((order) => order.articles.some((article) => {
        if (type == 'brand') {
          return article.brand === brand;
        }
        else {
          return article.categoryId === categoryId;
        }
      }))
      .map((order): ContextOperation => {
        const time = Time(moment.tz(order.date, 'Europe/Paris').startOf('day'));

        return {
          timestamp: time.timestamp,
          context: {
            timezone: time.timezone,
            order: OUTPUT_VALUE_ORDER
          }
        };
      })
      // Skip the first order and generate negative sample after it
      .thru(sample(timeQuantum, generateNegativeSample, {
        latest: latestOperation,
        extendFromPrevious: extendFromPreviousContext,
        keepLast: true
      }))
      .thru(buffer(client.cfg.operationsChunksSize))
      // Match the rate limiting of craft ai
      .thru(limiter(1000 / 50))
      .concatMap((operations) => fromPromise(client.addAgentContextOperations(id, operations)));
  }
}

function generateNegativeSample(previous: Partial<Context>, next: Partial<Context>, timestamp: number): Partial<Context> {
  return {
    timezone: Time(moment.tz(timestamp, 'Europe/Paris').startOf('day')).timezone,
    order: OUTPUT_VALUE_NO_ORDER
  };
}

function extendFromPreviousContext(current: Partial<Context>, previous: Partial<Context>, periodsSinceLastEvent: number): Partial<Context> {
  return { periodsSinceLastEvent };
}

function updateCategories(kit: Intelware.KitInternal, orders: Intelware.Type.Order[]) {
  const { clients, categories } = kit;

  return from(orders.sort((a, b) => +a.date - +b.date))
    .thru(retrieveCategoryAgents(kit))
    .tap(({ id, clientId, categoryId }) => log(`Updating agent '${id}' for '${clients[clientId] || clientId}' on '${categories[categoryId] || categoryId}'`))
    .concatMap((agent) => from(orders).thru(addOperations(kit, agent, 'category')))
    .drain();
}

function updateBrands(kit: Intelware.KitInternal, orders: Intelware.Type.Order[]) {
  const { clients, categories } = kit;

  return from(orders.sort((a, b) => +a.date - +b.date))
    .thru(retrieveBrandAgents(kit))
    .tap(({ id, clientId, categoryId }) => log(`Updating agent '${id}' for '${clients[clientId] || clientId}' on brand`))
    .concatMap((agent) => from(orders).thru(addOperations(kit, agent, 'brand')))
    .drain();
}

export default function update(kit: Intelware.KitInternal) {
  const { clients, categories } = kit;

  return (orders: Intelware.Type.Order[], type: string) => {
    switch (type) {
      case 'all':
        return Promise.all([
          updateCategories(kit, orders),
          updateBrands(kit, orders)
        ]);
      case 'brand':
        return updateBrands(kit, orders);
      case 'category':
        return updateCategories(kit, orders);
      default:
        return Promise.reject(new Error(`Unknown agent type ${type}. Allowed values: all, brand and category.`));
    }
  }
}
