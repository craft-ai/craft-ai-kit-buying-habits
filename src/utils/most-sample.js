import seedrandom from 'seedrandom';
import range from 'most-range';

import { empty, just } from 'most';

const emptyContext = () => ({});
const random = seedrandom('kit-buying-habits');

export function sample(period, generate = emptyContext, options = {}) {
  const extendFromPrevious = options.extendFromPrevious || emptyContext;
  const extendFromNext = options.extendFromNext || emptyContext;
  const latest = options.latest || null;

  let keepFirst = options.keepFirst === true;

  return (stream) => stream
    .concat(options.keepLast === true ? just(null) : empty())
    .loop((previous, operation) => {
      if (operation === null) {
        return {
          seed: null,
          value: previous !== null && previous !== latest && keepFirst
            ? just(mergeContext(previous, extendFromNext(previous.context, null, 0)))
            : empty()
        };
      }

      if (previous === null) {
        if (latest === null) {
          return {
            seed: mergeContext(operation, extendFromPrevious(operation.context, null, 0)),
            value: empty()
          };
        }

        previous = latest;
      }

      const previousTimestamp = previous.timestamp;
      const steps = Math.floor((operation.timestamp - previousTimestamp) / period);

      if (steps < 1) {
        return {
          seed: previous,
          value: empty()
        };
      }

      const previousContext = previous.context;
      const context = operation.context;

      operation.timestamp = previousTimestamp + steps * period;
      Object.assign(context, extendFromPrevious(context, previousContext, steps));
      Object.assign(previousContext, extendFromNext(previousContext, context, steps));

      const samples = range(1, steps)
        .filter(() => random() < 0.2)
        .map((step) => {
          const timestamp = previousTimestamp + step * period;
          const sampleContext = generate(previousContext, context, timestamp);
          const fromPreviousContext = extendFromPrevious(sampleContext, previousContext, step);
          const fromNextContext = extendFromNext(sampleContext, context, steps - step);

          return {
            timestamp,
            context: Object.assign(sampleContext, fromPreviousContext, fromNextContext)
          };
        });

      if (previous === latest || !keepFirst) {
        keepFirst = true;

        return {
          seed: operation,
          value: samples
        };
      }

      return {
        seed: operation,
        value: samples.startWith(previous)
      };
    }, null)
    .mergeConcurrently(1);
}

function mergeContext(operation, context) {
  Object.assign(operation.context, context);

  return operation;
}

export default sample;
