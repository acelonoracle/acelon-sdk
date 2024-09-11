# Use an official Node runtime as the base image
FROM node:20
RUN apt-get update && apt-get install -yq git build-essential

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json, yarn.lock, and npm-ci-publish.sh files
COPY package.json yarn.lock npm-ci-publish.sh ./

# Set permissions for npm-ci-publish.sh
RUN chmod +x ./npm-ci-publish.sh

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Set to production
ENV NODE_ENV=production

# Build
RUN yarn build
