# Implementation Plan

## Goal

Build a local supervisory stack that manages Antigravity work through the **exposed macOS window UI** and exposes a local MCP interface for higher-level management.

## Phase 1: Minimum Usable System

### Objectives
- establish repository structure
- create SQLite schema
- build the macOS Window UI Adapter interface
- implement a first Antigravity adapter slice
- expose MCP read tools
- expose a bounded `send_message` action
- capture evidence for all important actions
- create a watcher with deterministic polling
- implement a basic task state machine

### Deliverables
- working repository scaffold
- config loader
- DB migrations
- task ledger tables
- adapter interface
- initial adapter implementation
- MCP server with typed tools
- watcher process
- screenshots and evidence storage
- basic docs and tests

## Phase 2: Reliability Layer

### Objectives
- add retry policies
- add UI drift detection
- add confidence scoring
- add alerting
- add read-only fallback mode
- improve status inference
- add event queue and alert debounce

### Deliverables
- retry framework
- UI ambiguity detector
- failure classifier
- drift-aware write lock
- evidence bundles linked to alerts
- richer watcher rules

## Phase 3: Verification and Supervision

### Objectives
- support follow-up agents
- support verification agents
- add manager policy engine
- add summary builder
- add reliability scoring
- add escalation hooks

### Deliverables
- verification policy
- retry policy
- escalation policy
- task summaries
- reliability metrics
- manager prompt templates

## Phase 4: Operational Hardening

### Objectives
- improve recovery from app/window issues
- add monitoring dashboard or report outputs
- tune polling intervals
- make evidence review easier
- improve test coverage

### Deliverables
- health checks
- operational reports
- runbooks linked to alerts
- expanded test suite
- stable first release candidate

## Build Order

1. repository scaffold
2. config and logging
3. SQLite and migrations
4. domain types
5. adapter interface
6. first UI adapter implementation
7. MCP server
8. watcher
9. state machine
10. alerting and evidence
11. verification policy
12. manager scaffolding

## Required Discipline

- deterministic rules first
- evidence before action
- bounded writes
- confidence with every inference
- graceful fallback on ambiguity
- no references to browser-specific assumptions
- all references should say **exposed macOS window UI**
