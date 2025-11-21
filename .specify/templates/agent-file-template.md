# [PROJECT NAME] Development Guidelines

Auto-generated from all feature plans. Last updated: [DATE]

## Active Technologies

[EXTRACTED FROM ALL PLAN.MD FILES]

## Project Structure

```
[ACTUAL STRUCTURE FROM PLANS]
```

## Code Architecture Principles

Follow these principles when implementing features:

- **DRY Principle**: Avoid code duplication through proper abstraction and encapsulation. Extract repeated logic into reusable functions, classes, or modules.
- **SOLID Principles**:
  - Single Responsibility: Each class/module has one reason to change
  - Open/Closed: Open for extension, closed for modification
  - Liskov Substitution: Subtypes must be substitutable for base types
  - Interface Segregation: Clients should not depend on interfaces they don't use
  - Dependency Inversion: Depend on abstractions, not concretions
- **Separation of Concerns**: Maintain clear boundaries between layers (presentation, business logic, data access).
- **Dependency Injection**: Inject dependencies explicitly via constructors rather than instantiating within classes.
- **Composition vs Inheritance**: Favor composition over inheritance. Use inheritance only when there is a clear "is-a" relationship and shared behavior.

## Commands

[ONLY COMMANDS FOR ACTIVE TECHNOLOGIES]

## Code Style

[LANGUAGE-SPECIFIC, ONLY FOR LANGUAGES IN USE]

## Recent Changes

[LAST 3 FEATURES AND WHAT THEY ADDED]

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
