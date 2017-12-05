# Developers instructions #

## Running the tests locally ##

1. Make sure you have a version of [Node.js](https://nodejs.org) installed (any version >6.9 should work).
1. Create a test **craft ai** project and retrieve its **write token**.
2. At the root of your local clone, create a file named `.env` with the following content

  ```
  CRAFT_TOKEN=<retrieved_token>
  ```

3. Install the dependencies.

  ```console
  $ npm install
  ```

4. Run the tests!

  ```console
  $ npm test
  ```

## Releasing a new version (needs administrator rights) ##

1. Make sure the build of the master branch is passing.

  [![Build](https://img.shields.io/travis/craft-ai/craft-ai-kit-buying-habits/master.svg?style=flat-square)](https://travis-ci.org/craft-ai/craft-ai-kit-buying-habits)

2. Checkout the master branch locally.

  ```console
  $ git fetch
  $ git checkout master
  $ git reset --hard origin/master
  ```

3. Increment the version in `package.json` and move _Unreleased_ section
   of `CHANGELOG.md` to a newly created section for this version.

  ```console
  $ ./scripts/update_version.sh patch
  ```

  `./scripts/update_version.sh minor` and `./scripts/update_version.sh major` are
  also available - see [semver](http://semver.org) for a guideline on when to
  use which.

  > This will create a git commit and a git tag.

4. Push everything.

  ```console
  $ git push origin master --tags
  ```

  > This will trigger the publishing of this new version to [npm](https://www.npmjs.com/package/craft-ai-kit-buying-habits) by [travis](https://travis-ci.org/craft-ai/craft-ai-kit-buying-habits).
