---
type: Reference
title: Workspace Agent Instructions
description: Core style guidelines, behavioral constraints, and instructions for agents working on the obsidian-html-viewer repository.
tags: [onboarding, guidelines, rules]
timestamp: 2026-06-30T10:00:00Z
---

# Workspace Agent Instructions

Welcome, agent! This document contains the primary rules, constraints, and instructions for working on the `obsidian-html-viewer` repository.

To prevent context bloat and ensure you only load the information necessary for your current task, we use a **Progressive Disclosure** structure. Please refer to the specific playbooks below as needed.

## Core Behavioral Guidelines

1. **Strict Sandboxing**: Always respect and preserve the iframe sandbox and CSP boundaries.
2. **Seam-Based Testing**: Write and maintain unit tests for pure logical components, using mocks to isolate Obsidian dependencies.
3. **TypeScript Excellence**: Write fully typed code and compile it with the workspace configurations.
4. **Preserve Documentation**: Maintain existing comments and docstrings.

## Onboarding & Reference Topics

To dive deeper into specific components and constraints, read the following concepts:

### Codebase Structure & Architecture
* [Project Architecture](docs/rules/architecture.md) - Understand the files, folders, and component mappings of the plugin.

### Development & Builds
* [Development Workflow](docs/rules/development.md) - Learn how to build, lint, and run the developer dev server.

### Quality & Tests
* [Testing Standards](docs/rules/testing.md) - Guidelines on using Jest, ts-jest, and keeping coverage complete.

### Safety & Permissions
* [Security & Sandboxing](docs/rules/security.md) - Details on CSP policies, sandbox attributes, and resolving relative local paths securely.

### Distribution & Release
* [CI/CD Release Pipeline](docs/rules/releases.md) - Learn how releases are automated using GitHub tags and actions.

---

## Log

* See the [Change Log](docs/log.md) for the history of updates to these instructions.
