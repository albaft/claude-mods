// Which old-style replies have their "## Working" section opened, by message id.
export type OpenMap = Record<string, boolean>
// The record of finished turns, folded under one Working button per turn.
export type Folds = {
  // Each item (a text block "m:<id>" or a tool call "t:<tool_use_id>") and its turn.
  members: Record<string, string>
  // The first item of each turn: the one that draws the Working button.
  heads: Record<string, string>
  // The final answer of each turn, which stays in view.
  kept: Record<string, boolean>
  // Which turns the person opened.
  opened: Record<string, boolean>
}

declare module 'claude-code' {
  interface PluginState {
    'working-fold': { open: Shaped<OpenMap>; folds: Shaped<Folds> }
  }
}
