import type { RivetRegistry } from "./registry";

export interface MatchedCommand {
  extId: string;
  name: string;
}

export function findMatchingCommand(registry: RivetRegistry, e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): MatchedCommand | null {
  for (const ext of registry.list()) {
    if (!ext.enabled) continue;
    const commands = ext.manifest.commands ?? {};
    for (const [name, cmd] of Object.entries(commands)) {
      const shortcut = cmd.suggested_key?.default ?? cmd.suggested_key?.windows ?? "";
      if (!shortcut) continue;
      const parts = shortcut.toLowerCase().split("+").map((s) => s.trim());
      const needsCtrl = parts.includes("ctrl");
      const needsShift = parts.includes("shift");
      const needsAlt = parts.includes("alt");
      const key = parts.find((p) => !["ctrl", "shift", "alt", "command"].includes(p));
      if (
        key &&
        e.key.toLowerCase() === key &&
        (needsCtrl ? e.ctrlKey || e.metaKey : true) &&
        (needsShift ? e.shiftKey : !e.shiftKey) &&
        (needsAlt ? e.altKey : !e.altKey)
      ) {
        return { extId: ext.id, name };
      }
    }
  }
  return null;
}

export function triggerCommand(registry: RivetRegistry, extId: string, name: string): void {
  registry.broadcast(extId, (e) => e.commandsOnCommand, [name]);
}
