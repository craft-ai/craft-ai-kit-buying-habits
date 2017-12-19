require('dotenv').config();

const Kit = require('../bin/kit').default;
const moment = require('moment-timezone');
const test = require('ava');

const kit = Kit.create({ token: process.env.CRAFT_TOKEN });

function coerceToDate(dateStr) {
  if (!dateStr) {
    return undefined;
  }
  const m = moment(dateStr, 'YYYY-MM-DD');
  if (!m.isValid()) {
    throw new Error(`'${dateStr}' is not a valid date, use 'YYYY-MM-DD'.`);
  }
  return m.toDate();
}

// const clients = [
//   {
//     id: 'C1234',
//     name: 'foo'
//   },
//   {
//     id: 'C5678',
//     name: 'bar'
//   }
// ];

// const categories =  [
//   {
//     id: 'CAT-1',
//     name: 'category 1'
//   },
//   {
//     id: 'CAT-2',
//     name: 'category 2'
//   },
//   {
//     id: 'CAT-3',
//     name: 'category 3'
//   }
// ];

const orders = [
  {
    id: 'CH-A13H1-ORD',
    date: coerceToDate('2017-12-01'),
    clientId: 'C1234',
    articles: [
      {
        productId: 'APPLE-1',
        brand: 'FRUIT',
        categoryId: 'CAT-2',
        quantity: 12,
        price: 40
      },
      {
        productId: 'BANANA-4',
        brand: 'FRUIT',
        categoryId: 'CAT-2',
        quantity: 4,
        price: 12
      }
    ]
  },
  {
    id: 'CH-A13H1-ORD',
    date: coerceToDate('2017-12-05'),
    clientId: 'C1234',
    articles: [
      {
        productId: 'APPLE-1',
        brand: 'FRUIT',
        categoryId: 'CAT-2',
        quantity: 12,
        price: 40
      },
      {
        productId: 'BANANA-4',
        brand: 'FRUIT',
        categoryId: 'CAT-2',
        quantity: 4,
        price: 12
      },
      {
        productId: 'BEETROOT-150',
        brand: 'ROOT',
        categoryId: 'CAT-3',
        quantity: 1,
        price: 3.50
      }
    ]
  },
  {
    id: 'CH-A14H1-ORD',
    date: coerceToDate('2018-01-05'),
    clientId: 'C1234',
    articles: [
      {
        productId: 'TOMATO-1',
        brand: 'FRUIT',
        categoryId: 'CAT-1',
        quantity: 5,
        price: 32.75
      },
      {
        productId: 'BANANA-4',
        brand: 'FRUIT',
        categoryId: 'CAT-2',
        quantity: 14,
        price: 17.85
      },
      {
        productId: 'POTATO-190',
        brand: 'ROOT',
        categoryId: 'CAT-3',
        quantity: 250,
        price: 120
      }
    ]
  },
  {
    id: 'CH-A15H1-ORD',
    date: coerceToDate('2018-02-05'),
    clientId: 'C1234',
    articles: [
      {
        productId: 'CAROTT-8',
        brand: 'VEGETABLE',
        categoryId: 'CAT-1',
        quantity: 82,
        price: 910.32
      },
      {
        productId: 'ORANGE-891',
        brand: 'FRUIT',
        categoryId: 'CAT-2',
        quantity: 9,
        price: 102.89
      },
      {
        productId: 'GINSENG-1',
        brand: 'ROOT',
        categoryId: 'CAT-3',
        quantity: 8,
        price: 52.24
      }
    ]
  },
  {
    id: 'CH-A16H1-ORD',
    date: coerceToDate('2017-12-05'),
    clientId: 'C5678',
    articles: [
      {
        productId: 'APPLE-1',
        brand: 'FRUIT',
        categoryId: 'CAT-2',
        quantity: 82,
        price: 910.32
      },
      {
        productId: 'ORANGE-891',
        brand: 'FRUIT',
        categoryId: 'CAT-2',
        quantity: 9,
        price: 102.89
      },
      {
        productId: 'GINSENG-1',
        brand: 'ROOT',
        categoryId: 'CAT-3',
        quantity: 8,
        price: 52.24
      }
    ]
  },
  {
    id: 'CH-A17H1-ORD',
    date: coerceToDate('2017-12-25'),
    clientId: 'C5678',
    articles: [
      {
        productId: 'APPLE-1',
        brand: 'FRUIT',
        categoryId: 'CAT-2',
        quantity: 82,
        price: 910.32
      },
      {
        productId: 'ORANGE-891',
        brand: 'FRUIT',
        categoryId: 'CAT-2',
        quantity: 9,
        price: 102.89
      },
      {
        productId: 'GINSENG-1',
        brand: 'ROOT',
        categoryId: 'CAT-3',
        quantity: 8,
        price: 52.24
      }
    ]
  },
  {
    id: 'CH-A17H1-ORD',
    date: coerceToDate('2018-02-17'),
    clientId: 'C5678',
    articles: [
      {
        productId: 'APPLE-1',
        brand: 'FRUIT',
        categoryId: 'CAT-2',
        quantity: 91,
        price: 901.32
      },
      {
        productId: 'CAROTT-891',
        brand: 'VEGETABLE',
        categoryId: 'CAT-1',
        quantity: 3,
        price: 76.89
      },
      {
        productId: 'GINSENG-1',
        brand: 'ROOT',
        categoryId: 'CAT-3',
        quantity: 8,
        price: 52.24
      }
    ]
  }
];

test.before((t) => kit.update(orders, 'all'));

test.after.always('guaranteed cleanup', (t) => {
  return kit.destroy();
});

test('Request FRUIT in JAN to FEB', (t) => {
  return kit.request(
    [['CAT-1', 'CAT-2']],
    'FRUIT',
    coerceToDate('2018-01-05'),
    coerceToDate('2018-02-05'),
    'interested'
  )
    .then((resultRequest) => {
      t.is(resultRequest.length, 3);
      t.is(resultRequest[0].name, 'FRUIT_CAT-1_CAT-2');
      t.is(resultRequest[1].name, 'CAT-1_CAT-2');
      t.is(resultRequest[2].name, 'FRUIT');
      t.deepEqual(resultRequest[0].result.results, [
        {
          clientId: 'C1234',
          confidence: 0.6774609088897705
        },
        {
          clientId: 'C5678',
          confidence: 0.6774609088897705
        }
      ]);
      t.deepEqual(resultRequest[1].result.results, []);
      t.deepEqual(resultRequest[2].result.results, []);
    });
});
