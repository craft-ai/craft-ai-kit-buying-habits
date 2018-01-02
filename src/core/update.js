import _ from 'lodash';
import buffer from 'most-buffer';
import debug from 'debug';
import limiter from 'most-limiter';
import moment from 'moment-timezone';
import sample from '../utils/most-sample';

import { from, fromPromise } from 'most';
import { Time } from 'craft-ai';
import slugify from '../utils/slugify';

import orderEventConfiguration, {
  OUTPUT_VALUE_NO_ORDER,
  OUTPUT_VALUE_ORDER,
} from '../configurations/order_events_per_client_and_category';

const log = debug('craft-ai:kit-buying-habits');
const timeQuantum = orderEventConfiguration.time_quantum;

function retrieveBrandAgents(kit) {
  const { client } = kit;

  return (ordersStream) => {
    // Make sure the needed agents do exist
    const clientsMarkPromise = ordersStream
      .reduce((clientsMarks, { clientId, date, articles }) => {
        let ordersArticlesConstructor = [];
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
      .filter((agent) => agent.nbOrders >= 2)
      // Match the rate limiting of craft ai (2 requests per agent)
      .thru(limiter(1000 / 50 * 2, 10000))
      .chain((agent) => {
        const { id } = agent;

        return fromPromise(client
          .getAgent(id)
          .then(({ lastTimestamp }) => lastTimestamp
            ? client
              .getAgentContext(id, lastTimestamp)
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
                .then(() => agent);
            }

            return Promise.reject(error);
          }));
      });
  };
}

function retrieveCategoryAgents(kit) {
  const { client } = kit;

  return (ordersStream) => {
    // Make sure the needed agents do exist
    const clientsCategoriesPromise = ordersStream
      .reduce((clientsCategories, { clientId, date, articles }) => {
        let ordersArticlesCat = [];
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
      .filter((agent) => agent.nbOrders >= 2)
      // Match the rate limiting of craft ai (2 requests per agent)
      .thru(limiter(1000 / 50 * 2, 10000))
      .chain((agent) => {
        const { id } = agent;

        return fromPromise(client
          .getAgent(id)
          .then(({ lastTimestamp }) => lastTimestamp
            ? client
              .getAgentContext(id, lastTimestamp)
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
                .then(() => agent);
            }

            return Promise.reject(error);
          }));
      });
  };
}

function addOperations(kit, agent, type) {
  const { client } = kit;

  return (ordersStream) => {
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
      .map((order) => {
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
  };
}

function generateNegativeSample(previous, next, timestamp) {
  return {
    timezone: Time(moment.tz(timestamp, 'Europe/Paris').startOf('day')).timezone,
    order: OUTPUT_VALUE_NO_ORDER
  };
}

function extendFromPreviousContext(current, previous, periodsSinceLastEvent) {
  return { periodsSinceLastEvent };
}

function updateCategories(kit, orders) {
  const { clients, categories } = kit;

  return from(orders.sort((a, b) => +a.date - +b.date))
    .thru(retrieveCategoryAgents(kit))
    .tap(({ id, clientId, categoryId }) => log(`Updating agent '${id}' for '${clients[clientId] || clientId}' on '${categories[categoryId] || categoryId}'`))
    .concatMap((agent) => from(orders).thru(addOperations(kit, agent, 'category')))
    .drain();
}

function updateBrands(kit, orders) {
  const { clients } = kit;

  return from(orders.sort((a, b) => +a.date - +b.date))
    .thru(retrieveBrandAgents(kit))
    .tap(({ id, clientId, categoryId }) => log(`Updating agent '${id}' for '${clients[clientId] || clientId}' on brand`))
    .concatMap((agent) => from(orders).thru(addOperations(kit, agent, 'brand')))
    .drain();
}

export default function update(kit) {
  return (orders, type) => {
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
  };
}
