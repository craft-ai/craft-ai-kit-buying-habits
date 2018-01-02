import _ from 'lodash';
import limiter from 'most-limiter';
import moment from 'moment-timezone';
import range from 'most-range';
import { first } from 'most-nth';

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
    .reduce((array, value) => [...array, value], [])
    .then((results) => ({
      query: { categoryOrBrand, from: fromTimestamp, to: toTimestamp },
      results
    }));
}

function makeQuery(types, toDate, fromDate, levelOfInterest, intersectionArray, client, clientBase) {
  return _.reduce(types, (promise, type) => {
    return promise
      .then((arrayResults) => {
        return predictAgentsMakingOrders(
          type, 
          fromDate, 
          toDate, 
          LEVEL_OF_INTEREST[levelOfInterest],
          'Europe/Paris',
          client,
          clientBase)
          .then((result) => {
            arrayResults.push(result);
            return arrayResults;
          });
      });
  }, Promise.resolve([]))
    .then((listsResult) => {
      // remove multiple occurences
      let finalList = {
        query: [],
        results: []
      };
      let queryArrayResults = [];
      _.forEach(listsResult, (list) => {
        finalList.query.push(list.query);
        queryArrayResults.push(list.results.map(({ agentId, confidence }) => ({ clientId: agentId.split('-')[0], confidence })));
      });
      if (intersectionArray) {
        finalList.results = intersection(queryArrayResults);
      }
      else {
        finalList.results = union(queryArrayResults);
      }
      return finalList;
    });
}

function filterAgentsList(predictedClients, agentsList) {
  return _.filter(agentsList, (agent) => 
    _.findIndex(predictedClients.results, (agentResult) => agent.startsWith(agentResult.clientId)) < 0
  );
}

function generateQueries(categories, brand) {
  let querylist = _.reduce(categories, (querylist, category) => {
    let queryParam = {
      isIntersection: false,
      query: []
    };
    if (brand) {
      let categoryTemp = _.clone(category);
      categoryTemp.unshift(brand);
      queryParam = {
        isIntersection: true,
        query: categoryTemp
      };
      querylist.push(queryParam);
    }
    queryParam = {
      isIntersection: false,
      query: _.clone(category)
    };
    querylist.push(queryParam);
    return querylist;
  }, []);
  if (brand) {
    querylist.push({
      isIntersection: true,
      query: [brand]
    });
  }
  return querylist;
}

export default function request(kit) {
  const { client } = kit;

  return (categories, brand, from, to, levelOfInterest) => {
    // generate list of query
    const querylist = generateQueries(categories, brand);

    // Loop on queryList and update clients query result
    return client.listAgents()
      .then((agentsList) => {
        return _.reduce(querylist, (promise, result) => {
          return promise
            .then(({ finalResult, agentsList }) => makeQuery(
              result.query,
              to,
              from,
              levelOfInterest,
              result.isIntersection,
              kit.client,
              agentsList
            )
              .then((arrayResults) => {
                agentsList = filterAgentsList(arrayResults, agentsList);

                finalResult.push({
                  name: result.query.join('_'),
                  result: arrayResults
                });

                return { finalResult, agentsList };
              })
            );
        }, Promise.resolve({ finalResult: [], agentsList }));
      })
      .then(({ finalResult }) => finalResult);
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
