#!/bin/bash

# This script automates the deployment process for the ApitherapyV2 application.

# Exit immediately if a command exits with a non-zero status.
set -e

# 1. Install dependencies
echo "Installing project dependencies..."
npm install

# 2. Build the application for production
echo "Building the application..."
npm run build

# 3. Deploy to Firebase Hosting
echo "Deploying to Firebase Hosting..."
firebase deploy --only hosting

echo "Deployment successful!"
