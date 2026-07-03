---
okf_version: "0.1"
---

# Workspace Agent Knowledge Catalog

Welcome to the agent knowledge catalog and instructions for `obsidian-html-viewer`. This bundle uses the Google Open Knowledge Format (OKF) to organize documentation and playbooks.

## Core Guidelines

* [Workspace Agent Instructions](../AGENTS.md) - Core style guidelines, behavioral constraints, and instructions for agents working on the obsidian-html-viewer repository.

## Historical Requirements

* [Original User Request](ORIGINAL_REQUEST.md) - The original requirements specification for building the obsidian-html-viewer plugin.
* [Product Requirements Document](PRD.md) - The Product Requirements Document (PRD) detailing features, specifications, and scope for obsidian-html-viewer.

## Detailed Playbooks & References

* [Project Architecture](rules/architecture.md) - Deep-dive overview of the obsidian-html-viewer codebase structure and files.
* [Development Workflow](rules/development.md) - Core commands, build processes, and TypeScript development guidelines.
* [Testing Standards](rules/testing.md) - Guidelines for Jest tests, mock implementations, and verification.
* [Security & Sandboxing](rules/security.md) - Details on Content Security Policy (CSP), iframe sandbox attributes, and safety boundaries.
* [CI/CD Release Pipeline](rules/releases.md) - Overview of the GitHub Actions release workflow for publishing build artifacts.

## Architectural Decision Records (ADRs)

* [ADR 1: Inline Stylesheets for Relative CSS Loading](adr/0001-inline-stylesheets.md) - Rationale and design details for inlining CSS to bypass sandboxed iframe CSP limitations.

## History

* [Change Log](log.md) - Chronological log of updates and additions to these rules.
