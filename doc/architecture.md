# Architecture Overview

The `open-rules` application runs as a Node.js CLI tool. It emphasizes a unidirectional data flow from a centralized rules directory out to target-specific artifact files.

## High-Level Component Model

```mermaid
graph TD
    classDef files fill:#eef,stroke:#333,stroke-width:1px;
    classDef logic fill:#d4edda,stroke:#333,stroke-width:1px;
    
    subgraph Input [Source Directory: .open-rules/]
        CONF(`.open-rules/config.json`):::files
        CORE(`.open-rules/00-core.md`):::files
        RULES(`.open-rules/*.md`):::files
    end

    subgraph CLI Orchestration
        BIN[`bin/open-rules.js`]:::logic
        CLI[`src/cli.js`]:::logic
    end

    subgraph Adapters [src/targets/]
        IDX[`index.js`]:::logic
        HELP[`helpers.js`]:::logic
        T_COPILOT[`copilot.js`]:::logic
        T_CURSOR[`cursor.js`]:::logic
        T_CLAUDE[`claude.js`]:::logic
        T_GENERIC[`generic.js`]:::logic
    end
    
    subgraph Output [Generated Interfaces]
        O_COPILOT(`.github/copilot-instructions.md`):::files
        O_CURSOR(`.cursor/rules/open-rules.mdc`):::files
        O_CLAUDE(`CLAUDE.md`):::files
    end

    CONF --> CLI
    CORE --> CLI
    RULES --> CLI
    
    BIN -->|Bootstraps| CLI
    CLI -->|Resolves configuration| IDX
    
    IDX -->|Routes to target| T_COPILOT
    IDX -->|Routes to target| T_CURSOR
    IDX -->|Routes to target| T_CLAUDE
    
    T_COPILOT -->|Formats output| O_COPILOT
    T_CURSOR -->|Formats output| O_CURSOR
    T_CLAUDE -->|Formats output| O_CLAUDE
    
    HELP -.->|Shared Logic| T_COPILOT
    HELP -.->|Shared Logic| T_CURSOR
    HELP -.->|Shared Logic| T_CLAUDE
```

## The Sync Data Flow

The primary operation of the project is the `sync` command. Its data flow is strictly step-by-step:

1. **Config Loading**: `loadConfig()` reads `.open-rules/config.json`, merging it tightly over a set of sensible default configurations.
2. **File Discovery**: `listRuleFiles()` performs a recursive filesystem traversal on `.open-rules/`, yielding all valid input files aligned with configured inclusion extensions and exclusions.
3. **Lexical Sorting**: Rules are sorted lexicographically by their relative path length (e.g. `00-core.md` comes before `90-copilot.md`). This guarantees reproducible outputs and allows prioritization.
4. **Content Aggregation**:
   - `buildMergedRules()`: Returns the complete concatenated multi-markdown output.
   - `buildReferencedRules()`: Returns a list of pointer references for environments supporting file linking.
5. **Target Rendering Execution**: Iteration over mapped targets. The renderer corresponding to the target is extracted from `src/targets/index.js` and fed the configurations.
6. **Output generation**: Synchronous file-writes commit changes to the destination paths.

## Import Data Flow

To support onboarding to `open-rules`, the `import` tool operates in reverse.

```mermaid
sequenceDiagram
    participant Developer
    participant Extractor as src/cli.js (importRules)
    participant Existing as Source Configured Target (e.g., CLAUDE.md)
    participant Output as .open-rules/90-import-claude.md

    Developer->>Extractor: `open-rules import claude`
    Extractor->>Existing: Check if file exists
    Existing-->>Extractor: Yield Raw Content
    Extractor->>Extractor: stripLeadingFrontmatter()
    Extractor->>Extractor: Remove Title Headers
    
    rect rgb(240, 240, 240)
        Note over Extractor: Safeguard Check
        Extractor->>Extractor: Check `looksLikeGeneratedOpenRules()`
    end
    
    Extractor->>Output: Write cleaned content to 90-import-claude.md
```