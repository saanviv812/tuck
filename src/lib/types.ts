export interface Suggestion {
  category: string;
  tags: string[];
  vault_id: string | null;
}

export interface Thought {
  id: string;
  text: string;
  created_at: number; // ms epoch
  updated_at: number;
  vault_id: string | null; // null = Inbox
  category: string | null;
  tags: string[];
  suggestion: Suggestion | null;
  archived: boolean;
}

export interface Vault {
  id: string;
  name: string;
  color: string; // token name: orange | blush | butter | sage | sky | lilac | cocoa
  created_at: number;
}

export interface Settings {
  shortcut: string;
  buddy: string;
  launch_at_login: boolean;
  desk_pet: boolean;
  auto_suggest: boolean;
}

export interface State {
  thoughts: Thought[];
  vaults: Vault[];
  settings: Settings;
}

export const VAULT_COLORS = ["orange", "blush", "butter", "sage", "sky", "lilac", "cocoa"] as const;

export const DEFAULT_SETTINGS: Settings = {
  shortcut: "Ctrl+Shift+Space",
  buddy: "pip",
  launch_at_login: false,
  desk_pet: true,
  auto_suggest: true,
};
