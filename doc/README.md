# Open Rules Technical Documentation

Welcome to the technical documentation for **Open Rules**. 

The `open-rules` tool is a CLI application designed to consolidate AI-agent instructions into a single source of truth (the `.open-rules` directory), which then synchronizes and generates adapters for multiple distinct AI environments in common formats such as GitHub Copilot, Cursor, and Claude Code.

## Table of Contents

1. [Architecture Overview](./architecture.md) - System design, folder structures, and data flow.
2. [CLI Commands](./commands.md) - Detailed breakdown of initialization, sync, add, and import operations.
3. [Configuration](./configuration.md) - Understanding `.open-rules/config.json`.
4. [Extending the System](./extending.md) - How to implement new AI targets/adapters.

## Purpose

Different AI assistants (Copilot, Cursor, Claude Code, Cline, Windsurf, etc.) use different file names, frontmatter formats, and rules for ingesting instructions. Maintaining identical guidelines across multiple files leads to drift and duplication. `open-rules` solves this by giving you *one* place to write rules in plain Markdown and a single command to sync them to every target platform automatically.
