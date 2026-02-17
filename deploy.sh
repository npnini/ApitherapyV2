#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# 1. DELETE THE CACHE
# This removes the .firebase folder to prevent "ghost" files during deploy.
echo "Clearing Firebase CLI cache..."
rm -rf .firebase/

# 2. BUILD
echo "Building the application..."
npm run build

# 3. DEPLOY
echo "Deploying to Firebase Hosting..."
firebase deploy --only hosting --project apitherapyv2

echo "Deployment successful!"