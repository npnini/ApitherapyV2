# Project Overview
This is a web app that supports apitherapy caretakers in giving and documenting treatments to patients.
Its purpose is to give clinical information, document measures about treatments, and support treatment effectiveness data analysis.

# Tech Stack
- Frontend: React 18, Tailwind CSS
- Backend: Node.js
- Database: Firestore database, Firebase Storage, Big Query data warehouse 
- Package manager: npm
- Hosting: Firebase, Google Clod Platform for functions
- Firebase Emulators for local dev env. 
- Firebase Emulator web console is in port 5000. 
- Firebase Emulators ports for the components are seen when npm run dev:all is used to start the emyulators. the ports are also seen in the emulator web console
- there is a Firebaseproject for staging, and a Firebase project for production

# Commands
- Install dependencies: npm install
- Start dev server: npm run dev for local dev, npm run dev:all for starting Firebase Emulators
- Build: script deploy_staging.ps1 for deploy to cloud staging project, script deploy_prod.ps1 for deploying to cloud production project
- Run tests: n/a yet
- new-branch.ps1 - used to create a git branch
- finish-feature.ps1 - used to commit, sync and merge branch to main
- Main branch is: main


# Git & GitHub Rules
- This project has an existing local git repository connected to GitHub
- DO NOT initialize a new git repository
- DO NOT create new branches without explicit instruction
- DO NOT commit or push without explicit instruction
- DO NOT open pull requests without explicit instruction
- DO NOT modify .gitignore without explicit instruction

# File & Folder Rules
- DO NOT delete any files or folders
- DO NOT rename files or folders without explicit instruction
- DO NOT move files between folders without explicit instruction
- DO NOT modify environment files (.env, .env.local, .env.staging, .env.production)
- DO NOT modify configuration files without explicit instruction
  (e.g. package.json, tsconfig.json, vite.config.js, next.config.js)

# Package Rules
- DO NOT install new packages without explicit instruction
- DO NOT remove or upgrade existing packages without explicit instruction

# Coding Conventions
- read airules.md
- read Claude Style-Guide.md

# Project Structure
- /functions - contains all functions deployed in Google Cloud Platform
- /scripts - contain multiple scripts created through the project lifetime
- /src/components — reusable UI components
- /src/services — API and data fetching
- /src/utils — helper functions


# Notes
- nothing special yet
