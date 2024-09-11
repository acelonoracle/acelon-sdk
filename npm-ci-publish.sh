#!/bin/bash

set -e

# Publish to npm
echo "//registry.npmjs.org/:_authToken=$NPM_AUTH_TOKEN" > .npmrc
npm publish --access public

# Clean up
rm .npmrc