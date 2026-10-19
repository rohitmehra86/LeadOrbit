# ADR-001: pnpm workspaces + Turborepo

## Status

Accepted (Milestone 1)

## Context

LeadOrbit needs clear app/package boundaries and CI task orchestration.

## Decision

Use pnpm workspaces for linking and Turborepo for `build` / `lint` / `typecheck` / `test` pipelines.

## Consequences

- Single lockfile at repo root
- Apps cannot publish independently without extra work (acceptable for SaaS monorepo)
