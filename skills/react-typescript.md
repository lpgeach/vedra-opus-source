# React + TypeScript Development Skill

## Overview
This skill covers React development with TypeScript for building modern web applications.

## Key Concepts
1. **TypeScript Configuration**
   - Use strict mode
   - Define interfaces for props and state
   - Use enums for constants

2. **Component Architecture**
   - Functional components with hooks
   - Props interfaces
   - State management with useState/useReducer
   - Context API for global state

3. **Project Structure**
   ```
   src/
   ├── components/      # Reusable UI components
   ├── pages/          # Route components
   ├── hooks/          # Custom hooks
   ├── utils/          # Utility functions
   ├── types/          # TypeScript type definitions
   ├── services/       # API services
   └── assets/         # Static assets
   ```

4. **Best Practices**
   - Use TypeScript interfaces for all props
   - Implement proper error boundaries
   - Use React.memo for performance optimization
   - Implement lazy loading for routes
   - Use CSS modules or styled-components

5. **Tools**
   - Vite for build tooling
   - ESLint + Prettier for code quality
   - Jest + React Testing Library for testing
   - Storybook for component documentation

## Commands
```bash
# Create new React project with TypeScript
npm create vite@latest my-app -- --template react-ts

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## Common Patterns
- Custom hooks for reusable logic
- Context providers for state management
- Error boundaries for error handling
- Suspense for loading states