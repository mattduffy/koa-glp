# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- `npm run dev` - Run app in development mode with debug
- `npm run cluster-glp` - Run app in cluster mode with debug
- `npm test` - Run tests (currently none specified)

## Data/Utility Commands
- `npm run bootstrap` - Initialize environment
- `npm run newUser` - Create a new user
- `npm run loadData` - Load data into the system
- `npm run loadPier` - Load pier data
- `npm run createGeoJson` - Create GeoJSON files

## Code Style Guidelines
- ES Modules are used (import/export)
- Use Airbnb style guide with modifications
- No semicolons (rule: semi: ['error', 'never'])
- Debug logging with debug package (e.g., `const debug = Debug('namespace:subname')`)
- Error handling via try/catch blocks with appropriate error logging
- Line length: No strict limit (max-len is turned off)
- Prefer named exports over default exports
- Underscores in variable names are allowed

## Type System
- No explicit type system in use (plain JavaScript)
