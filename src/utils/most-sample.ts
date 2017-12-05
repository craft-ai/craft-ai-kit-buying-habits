import * as seedrandom from 'seedrandom';
import range from 'most-range';

import { Context, ContextOperation, Properties } from 'craft-ai';
import { Stream, empty, from, just, periodic } from 'most';

type Generator<P extends Properties> = (
  previous: Partial<Context<P>>,
  next: Partial<Context<P>>,
  timestamp: number) => Partial<Context<P>>

type FromPreviousExtender<P extends Properties> = (
  current: Partial<Context<P>>,
  previous: Partial<Context<P>> | null,
  periodSinceLastEvent: number) => Partial<Context<P>>

type FromNextExtender<P extends Properties> = (
  current: Partial<Context<P>>,
  next: Partial<Context<P>> | null,
  periodToUpcomingEvent: number) => Partial<Context<P>>

interface Options<P extends Properties> {
  latest?: ContextOperation<P> | null
  extendFromPrevious?: FromPreviousExtender<P>
  extendFromNext?: FromNextExtender<P>
  keepFirst?: boolean
  keepLast?: boolean
}

const emptyContext = () => ({});
const random = seedrandom('kit-buying-habits');

export function sample<P extends Properties> (period: number, generate: Generator<P> = emptyContext, options: Options<P> = {}) {
  const extendFromPrevious = options.extendFromPrevious || emptyContext;
  const extendFromNext = options.extendFromNext || emptyContext;
  const latest = options.latest || null;

  let keepFirst = options.keepFirst === true;

  return (stream: Stream<ContextOperation<P> | null>) => stream
    .concat(options.keepLast === true ? just(null) : empty())
    .loop<ContextOperation<P> | null, Stream<ContextOperation<P>>>((previous, operation) => {
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
      };

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
    .mergeConcurrently<ContextOperation<P>>(1)
}

function mergeContext<P extends Properties> (
  operation: ContextOperation<P>,
  context: Partial<Context<P>>) {
  Object.assign(operation.context, context);

  return operation;
}

export default sample;
