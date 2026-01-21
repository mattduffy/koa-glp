# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Screen Commands
- The app runs inside of a screen session.
- The command `screen -list` shows the list of currently running nodejs apps.
- This app is named koa-glp and should be included in the list of running apps.
- The app should only be run or restarted from inside a screen session.
- To connect use the unix command line tool, screen.
- `screen -list` - List the apps currently running in different screen sessions.
- `screen -R koa-glp` - Create a new screen session to run app if it is not included in the list of currently running screen sessions.
- `screen -r koa-glp` - Connect to a currently running screen session for this app.
- To disconnect from a screen session, without killing the currently running app, issue the key command sequence C-a C-d (where C means the control key, not the capital letter c).

## Build Commands
- `npm run dev` - Run app in development mode with debug
- `CORES=2 npm run cluster-glp` - Run app in cluster mode with debug
- `npm test` - Run tests (currently none specified)

## Data/Utility Commands
- `npm run bootstrap` - Initialize environment
- `npm run newUser` - Create a new user
- `npm run loadData` - Load data into the system
- `npm run loadPier` - Load pier data
- `npm run createGeoJson` - Create GeoJSON files

## Code Style Guidelines
- Use ES modules (import/export) syntax, not CommonJS (require)
- Destructure imports when possible (eg. import { foo } from 'bar')
- Use Airbnb style guide with modifications
- No semicolons (rule: semi: ['error', 'never'])
- Debug logging with debug package (e.g., `const debug = Debug('namespace:subname')`)
- Error handling via try/catch blocks with appropriate error logging
- Line length: No strict limit (max-len is turned off)
- Prefer named exports over default exports
- Underscores in variable names are allowed

## Type System
- No explicit type system in use (plain JavaScript)
