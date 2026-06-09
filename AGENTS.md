# Agent Instructions

Project status: early development (breaking changes are acceptable)

## Tooling

- **MUST use Bun** (`bun install`, `bun run`, etc.) for package management.
- **NEVER** use `npm`, `npx`, `yarn`, or `pnpm`.

## Getting started

- **ALWAYS** install dependencies after creating a new branch using `bun install`.
- **NEVER** run `bun run dev`, ask the user, most likely it is already running.

## Version Control

- **NEVER** commit without explicit user approval after they have tested and verified.
- **STRICTLY** follow **Conventional Commits** for commit messages.
  - **ALWAYS** add a `type` and a short `description` to the commit message.
  - **NEVER** use scopes in commit messages.
  - **NEVER** use uppercase letters in commit messages.
  - **NEVER** add extra lines to the commit messages.
- **STRICTLY** follow branch naming strategy described below.
  - **ALWAYS** use hyphens `-`, do not use underscores `_` or camel case `camelCase`.
  - **NEVER** commit directly to the `main` or `develop` branch.
  - **NEVER** add any prefix to the branch name (e.g., `feat/` or `fix/`).
  - **NEVER** use uppercase letters in branch names.
