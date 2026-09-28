# UI fixture conventions

Search exports the shared query-length threshold. Results imports that threshold, so a threshold change requires reviewing both contracts even when the consumer code is unchanged. Keep this relationship intact rather than copying a second threshold into Results.

The TypeScript files are synthetic contract fixtures, not a runnable UI library. Component-local API detail belongs here or beside the component source; the knowledge chapters demonstrate the shared dependency and review workflow.
