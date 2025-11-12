# Contributing to Nexus UI

## Welcome Contributors!

We're excited that you're interested in contributing to the Nexus UI project. This document provides guidelines to help you contribute effectively.

## Prerequisites

- Node.js 22+ (see package.json for exact requirements)
- npm (comes with Node.js)
- Familiarity with React, TypeScript, and modern web development practices

## Getting Started

### 1. Fork and Clone the Repository

1. Fork the repository on GitHub
2. Clone your forked repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/nexus-ui.git
   cd nexus-ui
   ```

### 2. Set Up Development Environment

```bash
# Install dependencies
npm ci

# Start development services
npm start
```

The application will be available at:

- UI: http://localhost:5173
- Mock API: http://localhost:3000

## Development Workflow

### Branch Strategy

- Create a new branch for each feature or bugfix
- Branch naming convention:
  - `feature/short-description`
  - `bugfix/short-description`
  - `docs/short-description`

### Making Changes

1. Create a new branch

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes
   - Follow existing code style
   - Add/update tests for your changes
   - Ensure all tests pass

3. Run tests and linting

   ```bash
   # Run all tests
   npm test

   # Format code
   npm run format
   ```

### Commit Guidelines

- Use meaningful commit messages
- Follow conventional commits format:

  ```
  type(scope): short description

  [optional detailed description]
  ```

  Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Pull Request Process

1. Ensure your code passes all tests and linting
2. Update documentation if necessary
3. Create a pull request with:
   - Clear title
   - Description of changes
   - Link to any related issues

### Code Review Process

- All submissions require review
- Maintainers will provide feedback
- Be prepared to make requested changes

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run UI package tests
npm run test:nexus-ui

# Run with coverage
npm run test:coverage
```

### Test Coverage

- Aim to maintain or improve test coverage
- Write unit and integration tests for new features

## Reporting Issues

### Bug Reports

- Use GitHub Issues
- Include:
  - Steps to reproduce
  - Expected behavior
  - Actual behavior
  - Environment details (OS, Node version, etc.)

### Feature Requests

- Describe the proposed feature
- Provide context and use cases
- Be open to discussion

## Code of Conduct

- Be respectful and inclusive
- Collaborate constructively
- Focus on technical merit

## Questions?

If you have questions, please:

- Check existing documentation
- Open an issue for discussion
- Reach out to maintainers

Thank you for contributing to Nexus UI!
