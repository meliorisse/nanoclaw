# Repository Structure

## Proposed tree

```text
antigravity-overseer/
  package.json
  tsconfig.json
  README.md
  .env.example

  src/
    adapter/
      core/
        adapter.ts
        session.ts
        evidence.ts
        errors.ts
      macos-ui/
        window-controller.ts
        navigation.ts
        interaction.ts
        screenshots.ts
        extraction.ts
        anchors.ts
        state-detector.ts
      parsing/
        project-parser.ts
        conversation-parser.ts
        status-parser.ts
        normalization.ts

    mcp/
      server.ts
      schemas.ts
      tools/
        list-projects.ts
        list-conversations.ts
        get-conversation.ts
        send-message.ts
        get-status.ts
        capture-evidence.ts
        create-followup-agent.ts
        list-alerts.ts
        acknowledge-alert.ts
        get-task-summary.ts
        list-tasks.ts
        get-task-timeline.ts
        retry-task.ts
        request-verification.ts

    watcher/
      watcher.ts
      scheduler.ts
      rules.ts
      thresholds.ts
      classifier.ts
      event-queue.ts

    manager/
      policy-engine.ts
      retry-policy.ts
      verification-policy.ts
      escalation-policy.ts
      state-machine.ts
      summary-builder.ts
      prompt-templates.ts

    llm/
      local-client.ts
      classification.ts
      summarization.ts

    db/
      client.ts
      schema.sql
      migrations/
      repositories/
        projects.ts
        conversations.ts
        agents.ts
        tasks.ts
        task-events.ts
        snapshots.ts
        alerts.ts
        supervisory-actions.ts

    config/
      config.ts
      defaults.ts

    types/
      domain.ts
      events.ts
      evidence.ts
      tool-results.ts
      policies.ts

    utils/
      logger.ts
      retry.ts
      time.ts
      ids.ts
      paths.ts

  docs/
    architecture.md
    implementation-plan.md
    repository-structure.md
    data-model.md
    mcp-tools.md
    task-state-machine.md
    event-flow.md
    failure-modes.md
    runbooks.md
    manager-policy.md
    config-spec.md
    codex-handoff.md

  tests/
    parsing/
    state-machine/
    watcher/
    repositories/
```

## Notes

- `adapter/macos-ui` is the only app-specific integration layer.
- `manager` should not know anything about UI anchors or click targets.
- `mcp/tools` should be thin wrappers over services and repositories.
- `tests` should focus first on parsing, state transitions, and watcher rules.
