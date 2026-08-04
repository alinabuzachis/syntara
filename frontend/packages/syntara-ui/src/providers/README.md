# Providers

Global React context providers — sources of shared app state.

## Rule

**State belongs here; UI belongs in `src/components/`.**

If a file wraps a `React.createContext` + `Provider` that is consumed app-wide, it lives in `src/providers/`. Pure UI components (layout wrappers, shared widgets) that do not own context go in `src/components/` instead.
