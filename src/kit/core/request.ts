import * as _ from 'lodash';
import * as moment from 'moment-timezone';

import limiter from 'most-limiter';
import range from 'most-range';

import { Time, decide } from 'craft-ai';
import { Stream, empty, from, fromPromise } from 'most';

import { getLastOperation, slugify } from './utils';

import orderEventConfiguration, {
  OUTPUT_VALUE_ORDER,
  OUTPUT_VALUE_NO_ORDER,
  ContextOperation,
  Properties
} from '../configurations/order_events_per_client_and_category';

// type
import { Intelware } from '../../../typings/index';
import * as CraftAi from 'craft-ai';

const LEVEL_OF_INTEREST = {
  'interested': 0.01,
  'fan': 0.85,
  'super_fan': 0.90
}

interface QueryParams {
  isIntersection: boolean
  query: string[]
}

const timeQuantum = orderEventConfiguration.time_quantum as number;

function makeQuery(types: string[], dateTo, dateFrom, levelOfInterest,
                   intersectionArray: boolean, client: CraftAi.Client, clientBase: string[]) {
  return _.reduce(types, (promise: Promise<Intelware.QueryResults[]>, type) => {
    const categoryId = slugify(' ', type);
    const timestamp = moment.tz(dateFrom, 'Europe/Paris').startOf('day').unix();
    const to = dateTo
      ? moment.tz(dateTo, 'Europe/Paris').startOf('day').unix()
      : timestamp + timeQuantum;

    return promise
      .then((arrayResults) => from(clientBase)
        .filter((agentId) => agentId.endsWith(categoryId))
        .thru(limiter(1000 / 50 * 2)) // Match the rate limiting of craft ai (2 requests per agent)
        .chain((agentId) => fromPromise(client
          .getAgentContextOperations<Properties>(agentId)
          .then((operations) => {
            if (operations.length < 2) {
              // Not enough information, thus always predicting `ORDER`
              return empty();
            }

            const lastTimestamp = (_.last(operations) as ContextOperation).timestamp;
            const treeTimestamp = timestamp > lastTimestamp ? lastTimestamp : timestamp;
            const lastOrder = getLastOperation(operations, treeTimestamp);

            if (!lastOrder) {
              // Unable to decide with no past order
              return empty();
            }

            let lastOrderTimestamp = moment.tz(lastOrder.timestamp * 1000, 'Europe/Paris');

            return client.getAgentDecisionTree<Properties>(agentId, treeTimestamp)
              .then((tree) => range(timestamp, to, timeQuantum)
                .map((timestamp) => {
                  const time = moment.tz(timestamp * 1000, 'Europe/Paris');
                  const periodsSinceLastEvent = Math.floor(time.diff(lastOrderTimestamp) / 1000 / timeQuantum);
                  const decision = decide(tree, { periodsSinceLastEvent }, Time(time)).output.order;

                  if (decision.predicted_value === OUTPUT_VALUE_ORDER) {
                    lastOrderTimestamp = time;
                    return decision.confidence as number;
                  }
                  return 0;
                })
                .skipWhile((confidence) => confidence <= LEVEL_OF_INTEREST[levelOfInterest])
                .take(1)
                .map((confidence) => ({ clientId: agentId.split('-')[0], confidence }))
              );
          }))
        )
        .join()
        .reduce<Intelware.QueryResult[]>((array, value) => [...array, value], [])
        .then((results) => {
          arrayResults.push({
            query: { categoryId: categoryId, from: timestamp, to },
            results
          });
          return arrayResults;
        }));
  }, Promise.resolve([] as Intelware.QueryResults[]))
  .then<Intelware.QueryArrayResults>((listsResult) => {
    // remove multiple occurences
    let finalList = {
      query: [],
      results: []
    } as Intelware.QueryArrayResults;
    let queryArrayResults = [] as Intelware.QueryResult[][];
    _.forEach(listsResult, (list: Intelware.QueryResults) => {
      finalList.query.push(list.query);
      queryArrayResults.push(list.results);
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


export default function request(kit: Intelware.KitInternal) {
  const { client } = kit;

  return (categories, brand, from, to, levelOfInterest) => {
    // generate list of query
    let querylist = [] as QueryParams[];
    _.forEach(categories, (category) => {
      let queryParam = {
        isIntersection: false,
        query: [] as string[]
      } as QueryParams;
      if (brand) {
        let categoryTemp = _.clone(category);
        categoryTemp.unshift(brand);
        queryParam = {
          isIntersection: true,
          query: categoryTemp
        } as QueryParams;
        querylist.push(queryParam);
      }
      queryParam = {
        isIntersection: false,
        query: _.clone(category)
      } as QueryParams;
      querylist.push(queryParam);
    });
    if (brand) {
      querylist.push({
        isIntersection: true,
        query: [brand]
      } as QueryParams);
    }

    // Loop on queryList and update clients query result
    return client.listAgents()
      .then((agentsList: string[]) => {
        return _.reduce(querylist, (promise: Promise<Intelware.RequestResult[]>, result: QueryParams) => {
          return promise
            .then((finalResult) => makeQuery(
                result.query,
                to,
                from,
                levelOfInterest,
                result.isIntersection,
                kit.client,
                agentsList
              )
              .then((arrayResults) => {
                // remove agents from agentsList to avoid double
                _.remove(agentsList, (agent) => {
                  return _.findIndex(arrayResults.results, (agentResult) => {
                    return agent.startsWith(agentResult.clientId);
                  }) != -1;
                });

                finalResult.push({
                  name: result.query.join('_'),
                  result: arrayResults
                });

                return finalResult;
              })
            );
        }, Promise.resolve([] as Intelware.RequestResult[]));
    });
  };
};

function union(arrayOfArray: Intelware.QueryResult[][]) {
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
  }, [] as Intelware.QueryResult[]);
}

function intersection(arrayOfArray: Intelware.QueryResult[][]) {
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
  }, [] as Intelware.QueryResult[]);
}
