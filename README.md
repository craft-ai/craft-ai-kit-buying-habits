# craft ai buyings habits kit #

> :construction: Under construction

## Usage ##

This integration kit has been developed using Node.JS v6.9.1, it should work with any later Node.JS v6.X version.

### Create the kit ###

The kit uses the following **environment variables** for secrets and global configuration.

 - `DEBUG` can be used to select the logs that you want to display, set it to 'craft-ai:*' for all the logs related to **craft ai**.

With this environment variable set, create the kit like that:

```js
const createBuyingHabitsKit = require('path/to/this/directory/src');

const kit = createBuyingHabitsKit({
  // Mandatory, the craft ai token for the project the kit will use.
  token: '{craft-ai-token}',
  // Optional
  // Dictionary of the clients
  clients: '{clients-dictionary}',
  // Optional
  // Dictionary of the category
  categories: '{clients-category}'
});
```

### Functions ###

> All the functions exposed by the kit return es2015 [**Promises**](http://www.datchley.name/es6-promises/).

#### `client` datastructure ####

```js
{
  id: 'C45678', // A unique identifier for the user
  name: '...', // Name of the client optional
}
```

#### `category` datastructure ####

```js
{
  id: 'VID', // A unique identifier for the user
  name: '...' // Complete name of the category
}
```

#### `order` datastructure ####

```js
{
  id: 'A13H1', // A unique identifier for order
  date: ..., // A js Date
  clientId: 'C45678', // Client identifier
  articles: [] // Array of articles composing the order
}
```

#### `article` datastructure ####

```js
{
  productId: 'CH89A-099' // A unique identifier for order
  brand: '...' // brand name of the article
  categoryId: '...' // Category name of the article
  quantity: ... // Number of article ordered
  price: ... // Total price
}
```

### `kit.destroy` ###

Deletes all the agents created by the kit.

### `kit.update` ###

Creates and updates craft ai agents as needed.

#### Parameters ####

<table>
  <tr>
    <td>orders</td><td>Array of orders</td>
  </tr>
  <tr>
    <td>type</td><td>Can take value in [all, brand, category]. Generate/update agents according to the value</td>
  </tr>
<table>

### `kit.query` ###

Retrieve lists of clients based on buyings habits.

#### Parameters ####

<table>
  <tr>
    <td>categories</td><td>Array of categories array</td>
  </tr>
  <tr>
    <td>brand</td><td>[Optional] The brand name used to generate the list</td>
  </tr>
  <tr>
    <td>from</td><td>Timestamp from where to generate the list</td>
  </tr>
  <tr>
    <td>to</td><td>Timestamp from where to generate the list</td>
  </tr>
  <tr>
    <td>levelOfInterest</td><td>Fan or interested</td>
  </tr>
<table>

### `kit.validate` ###

Validate model based on orders data.

#### Parameters ####

<table>
  <tr>
    <td>orders</td><td>Array of orders used to validate the model</td>
  </tr>
  <tr>
    <td>type</td><td>values: [all, brand, category]. What kind of agents we want to validate</td>
  </tr>
<table>