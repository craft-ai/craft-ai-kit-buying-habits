import _ from 'lodash';
import limiter from 'most-limiter';
import buffer from 'most-buffer';
import moment from 'moment-timezone';
import range from 'most-range';
import { first, last } from 'most-nth';

import { decide, Time } from 'craft-ai';
import * as most from 'most';
import slugify from '../utils/slugify';
import getLastOperation from '../utils/getLastOperation';

import orderEventConfiguration, { OUTPUT_VALUE_ORDER } from '../configurations/order_events_per_client_and_category';

const LEVEL_OF_INTEREST = {
  'interested': 0.01,
  'fan': 0.85,
  'super_fan': 0.90
};

const timeQuantum = orderEventConfiguration.time_quantum;

function predictNextOrder(decisionTree, from, to, lastOrderTimestamp, confidenceThreshold, tz) {
  const tq = decisionTree.configuration.time_quantum;
  return range(from, to, tq)
    .loop((lastOrderTimestamp, timestamp) => {
      const datetime = moment.tz(timestamp * 1000, tz);
      const periodsSinceLastEvent = Math.floor((lastOrderTimestamp - timestamp) / tq);
      const decision = decide(decisionTree, { periodsSinceLastEvent }, Time(datetime)).output.order;

      if (decision.predicted_value === OUTPUT_VALUE_ORDER) {
        return {
          value: decision,
          seed: datetime.unix()
        };
      }
      return {
        value: {
          ...decision,
          confidence: 0
        },
        seed: lastOrderTimestamp
      };
    }, lastOrderTimestamp)
    .skipWhile(({ confidence }) => confidence <= confidenceThreshold)
    .thru(first);
}

function predictAgentsMakingOrders(categoryOrBrand, fromDate, toDate, confidenceThreshold, tz, client, agentsList) {
  const categoryOrBrandSlug = slugify(' ', categoryOrBrand);
  const fromTimestamp = moment.tz(fromDate, tz).startOf('day').unix();
  const toTimestamp = toDate
    ? moment.tz(toDate, tz).startOf('day').unix()
    : fromTimestamp + timeQuantum;

  return most.from(agentsList)
    .filter((agentId) => agentId.endsWith(categoryOrBrandSlug)) // Filtering the agents we want to make predictions on
    .thru(limiter(1000 / 50 * 2)) // Match the rate limiting of craft ai (2 requests per agent)
    .chain((agentId) => most.fromPromise(client
      // TODO: We just need the last operation to be able to compute the initial lastOrder timestamp.
      .getAgentContextOperations(agentId)
      .then((operations) => {
        if (operations.length < 2) {
          // Not enough information, thus always predicting `ORDER`
          return;
        }

        const lastTimestamp = (_.last(operations)).timestamp;
        const treeTimestamp = Math.min(fromTimestamp, lastTimestamp);
        const lastOrder = getLastOperation(operations, treeTimestamp);

        if (!lastOrder) {
          // Unable to decide with no past order
          return;
        }

        return client.getAgentDecisionTree(agentId, treeTimestamp)
          .then((tree) => predictNextOrder(tree, fromTimestamp, toTimestamp, lastOrder.timestamp, confidenceThreshold, tz))
          .then(({ confidence }) => ({ agentId, confidence }));
      }))
    )
    .filter((value) => !!value)
    .thru(buffer())
    .thru(last);
}

function filterAgentsList(agentsList, predictedClients) {
  return _.filter(agentsList, (agent) => 
    _.findIndex(predictedClients, ({ clientId }) => agent.startsWith(clientId)) < 0
  );
}

function createUnionQuery(categoryOrBrandList, fromDate, toDate, levelOfInterest, client) {
  return (potentialAgentsList) => most.from(categoryOrBrandList)
    .concatMap((category) => most.fromPromise(predictAgentsMakingOrders(
      category, 
      fromDate, 
      toDate, 
      LEVEL_OF_INTEREST[levelOfInterest],
      'Europe/Paris',
      client,
      potentialAgentsList).then((predictedAgentsList) => _.map(predictedAgentsList, ({ agentId, confidence }) => ({ clientId: agentId.split('-')[0], confidence }))))
    )
    .thru(buffer())
    .thru(last)
    .then((predictedClientsListList) => {
      const predictedClientsList = union(predictedClientsListList);
      const remainingAgentsList = filterAgentsList(potentialAgentsList, predictedClientsList);
      return {
        query: categoryOrBrandList.join('_'),
        clients: predictedClientsList,
        remainingAgentsList
      };
    });
}

function createQueries(brand, categoryGroupList, from, to, levelOfInterest, client) {
  const brandQuery = brand ? createUnionQuery([brand], from, to, levelOfInterest, client) : undefined;
  let queries = _.reduce(categoryGroupList, (queries, categoryGroup) => {
    const categoryGroupQuery = createUnionQuery(categoryGroup, from, to, levelOfInterest, client);
    if (brandQuery) {
      queries.push((potentialAgentsList) => {
        return brandQuery(potentialAgentsList).then((brandQueryResult) => categoryGroupQuery(potentialAgentsList).then((categoryQueryResult) => {
          const predictedClientsList = intersection(brandQueryResult.clients, categoryQueryResult.clients);
          const remainingAgentsList = filterAgentsList(potentialAgentsList, predictedClientsList);
          return {
            query: `${brand}_${categoryGroup.join('_')}`,
            clients: predictedClientsList,
            remainingAgentsList: remainingAgentsList
          };
        }));
      });
    }
    queries.push(categoryGroupQuery);
    return queries;
  }, []);
  if (brandQuery) {
    queries.push(brandQuery);
  }
  return queries;
}

export default function request(kit) {
  const { client } = kit;

  return (categoryGroupList, brand, from, to, levelOfInterest) => {
    // Create the queries, ready to be executed
    const queries = createQueries(brand, categoryGroupList, from, to, levelOfInterest, client);

    // Loop on queryList and update clients query result
    return client.listAgents()
      .then((agentsList) => {
        return _.reduce(queries, (promise, query) => {
          return promise
            .then(({ result, remainingAgentsList }) => 
              query(remainingAgentsList)
                .then(({ query, clients, remainingAgentsList }) => {
                  result.push({ query, clients });

                  return { result, remainingAgentsList };
                })
            );
        }, Promise.resolve({ result: [], remainingAgentsList: agentsList }));
      })
      .then(({ result }) => result);
  };
}

function union(arrayOfArray) {
  let ref = _.head(arrayOfArray);
  let comparisonArray = _.drop(arrayOfArray);

  return _.reduce(ref, (result, element) => {
    let maxConfidence = element.confidence;
    _.forEach(comparisonArray, (array) => {
      let index = _.findIndex(array, (elementArray) => elementArray.clientId == element.clientId);
      if (index !== -1) {
        maxConfidence = Math.max(maxConfidence, array[index].confidence);
      }
    });
    element.confidence = maxConfidence;
    result.push(element);
    return result;
  }, []);
}

function intersection(arrayOfArray) {
  let ref = _.head(arrayOfArray);
  let comparisonArray = _.drop(arrayOfArray);

  return _.reduce(ref, (result, element) => {
    let found = false;
    let maxConfidence = element.confidence;
    _.forEach(comparisonArray, (array) => {
      let index = _.findIndex(array, (elementArray) => elementArray.clientId == element.clientId);
      if (index !== -1) {
        found = true;
        maxConfidence = Math.max(maxConfidence, array[index].confidence);
      }
    });
    if (found) {
      element.confidence = maxConfidence;
      result.push(element);
    }
    return result;
  }, []);
}
