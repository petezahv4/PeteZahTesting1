import { EventHub } from "../eventHub";
import type { ChromeApiContext } from "./context";

export function createPlatformApis(context: ChromeApiContext) {
  const { realm, extId, registry, ext, events } = context;

  const i18n = {
    getMessage: (messageName: string, substitutions?: string | string[]) => {
      const message = ext.messages[messageName];
      if (!message) return "";
      let text = message.message ?? "";
      if (substitutions) {
        const values = Array.isArray(substitutions)
          ? substitutions
          : [substitutions];
        values.forEach((value, index) => {
          text = text.replace(new RegExp(`\\$${index + 1}`, "g"), value);
        });
      }
      return text;
    },
    getUILanguage: () => realm.navigator.language || "en",
    detectLanguage: (_text: string, cb?: (result: unknown) => void) => {
      const result = { isReliable: false, languages: [] };
      cb?.(result);
      return Promise.resolve(result);
    },
    getAcceptLanguages: (cb?: (languages: string[]) => void) => {
      const result = [realm.navigator.language || "en"];
      cb?.(result);
      return Promise.resolve(result);
    },
  };

  const identity = {
    getAuthToken: (
      _details: unknown,
      cb?: (token: string | undefined) => void,
    ) => {
      const result = undefined;
      cb?.(result);
      return Promise.resolve(result);
    },
    launchWebAuthFlow: (
      _details: unknown,
      cb?: (url: string | undefined) => void,
    ) => {
      const result = undefined;
      cb?.(result);
      return Promise.resolve(result);
    },
    getRedirectURL: (path?: string) =>
      `https://rivet.invalid/${extId}/${path ?? ""}`,
    removeCachedAuthToken: (_details: unknown, cb?: () => void) => {
      cb?.();
      return Promise.resolve(undefined);
    },
  };

  const commands = {
    getAll: (cb?: (commands: unknown[]) => void) => {
      const manifestCommands = ext.manifest.commands ?? {};
      const list = Object.entries(manifestCommands).map(([name, command]) => ({
        name,
        description: command.description ?? "",
        shortcut: command.suggested_key?.default ?? "",
      }));
      cb?.(list);
      return Promise.resolve(list);
    },
    onCommand: events.commandsOnCommand.toApi(),
  };

  const omnibox = {
    setDefaultSuggestion: (_suggestion: unknown) => {},
    onInputStarted: new EventHub().toApi(),
    onInputChanged: new EventHub().toApi(),
    onInputEntered: new EventHub().toApi(),
    onInputCancelled: new EventHub().toApi(),
  };

  const proxy = {
    settings: {
      get: (_details: unknown, cb?: (result: unknown) => void) => {
        const result = {
          value: { mode: "direct" },
          levelOfControl: "controlled_by_this_extension",
        };
        cb?.(result);
        return Promise.resolve(result);
      },
      set: (_details: unknown, cb?: () => void) => {
        cb?.();
        return Promise.resolve(undefined);
      },
      clear: (_details: unknown, cb?: () => void) => {
        cb?.();
        return Promise.resolve(undefined);
      },
    },
    onProxyError: new EventHub().toApi(),
  };

  const system = {
    cpu: {
      getInfo: (cb?: (info: unknown) => void) => {
        const result = {
          numOfProcessors: 4,
          "arch-name": "x86-64",
          modelName: "Rivet vCPU",
          features: [],
        };
        cb?.(result);
        return Promise.resolve(result);
      },
    },
    memory: {
      getInfo: (cb?: (info: unknown) => void) => {
        const result = {
          capacity: 8 * 1024 * 1024 * 1024,
          availableCapacity: 4 * 1024 * 1024 * 1024,
        };
        cb?.(result);
        return Promise.resolve(result);
      },
    },
    storage: {
      getInfo: (cb?: (info: unknown[]) => void) => {
        cb?.([]);
        return Promise.resolve([]);
      },
    },
    display: {
      getInfo: (cb?: (info: unknown[]) => void) =>
        cb?.([
          {
            id: "0",
            isPrimary: true,
            isInternal: false,
            isEnabled: true,
            bounds: {
              left: 0,
              top: 0,
              width: realm.screen.width,
              height: realm.screen.height,
            },
          },
        ]),
    },
  };

  const power = {
    requestKeepAwake: (_level?: string) => {},
    releaseKeepAwake: () => {},
  };

  const management = {
    getSelf: (cb?: (info: unknown) => void) => {
      const result = {
        id: extId,
        name: ext.manifest.name,
        version: ext.manifest.version ?? "",
        enabled: ext.enabled,
        type: "extension",
      };
      cb?.(result);
      return Promise.resolve(result);
    },
    getAll: (cb?: (all: unknown[]) => void) =>
      cb?.(
        registry.list().map((extension) => ({
          id: extension.id,
          name: extension.manifest.name,
          version: extension.manifest.version ?? "",
          enabled: extension.enabled,
          type: "extension",
        })),
      ),
    setEnabled: (_id: string, _enabled: boolean, cb?: () => void) => {
      cb?.();
      return Promise.resolve(undefined);
    },
    uninstallSelf: (_options: unknown, cb?: () => void) => {
      cb?.();
      return Promise.resolve(undefined);
    },
    onEnabled: new EventHub().toApi(),
    onDisabled: new EventHub().toApi(),
  };

  const webNavigation = {
    getFrame: (_details: unknown, cb?: (frame: unknown) => void) => {
      const result = null;
      cb?.(result);
      return Promise.resolve(result);
    },
    getAllFrames: (_details: unknown, cb?: (frames: unknown[]) => void) => {
      const result: unknown[] = [];
      cb?.(result);
      return Promise.resolve(result);
    },
    onBeforeNavigate: new EventHub().toApi(),
    onCommitted: new EventHub().toApi(),
    onCompleted: events.webNavigationOnCompleted.toApi(),
    onDOMContentLoaded: new EventHub().toApi(),
    onErrorOccurred: new EventHub().toApi(),
    onHistoryStateUpdated: new EventHub().toApi(),
    onReferenceFragmentUpdated: new EventHub().toApi(),
  };

  const tts = {
    speak: (
      utterance: string,
      options?: {
        lang?: string;
        rate?: number;
        pitch?: number;
        volume?: number;
      },
      cb?: () => void,
    ) => {
      try {
        const SpeechSynthesisUtteranceConstructor = (
          realm as unknown as {
            SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance;
          }
        ).SpeechSynthesisUtterance;
        const value = new SpeechSynthesisUtteranceConstructor(utterance);
        if (options?.lang) value.lang = options.lang;
        if (options?.rate) value.rate = options.rate;
        if (options?.pitch) value.pitch = options.pitch;
        if (options?.volume) value.volume = options.volume;
        realm.speechSynthesis.speak(value);
      } catch {
      }
      cb?.();
    },
    stop: () => realm.speechSynthesis?.cancel(),
    isSpeaking: (cb?: (speaking: boolean) => void) => {
      const result = realm.speechSynthesis?.speaking ?? false;
      cb?.(result);
      return Promise.resolve(result);
    },
    getVoices: (cb?: (voices: unknown[]) => void) =>
      cb?.(
        (realm.speechSynthesis?.getVoices() ?? []).map((voice) => ({
          voiceName: voice.name,
          lang: voice.lang,
          remote: false,
          extensionId: "",
        })),
      ),
    onEvent: new EventHub().toApi(),
  };

  const clipboard = {
    setImageData: (_imageData: unknown, _type: string, cb?: () => void) => {
      cb?.();
      return Promise.resolve(undefined);
    },
  };

  const fontSettings = {
    getFont: (_details: unknown, cb?: (font: unknown) => void) => {
      const result = {
        fontId: "Arial",
        levelOfControl: "controllable_by_this_extension",
      };
      cb?.(result);
      return Promise.resolve(result);
    },
    setFont: (_details: unknown, cb?: () => void) => {
      cb?.();
      return Promise.resolve(undefined);
    },
    clearFont: (_details: unknown, cb?: () => void) => {
      cb?.();
      return Promise.resolve(undefined);
    },
    getFontList: (
      cb?: (fonts: { fontId: string; displayName: string }[]) => void,
    ) => {
      const fonts = [
        "Arial",
        "Arial Black",
        "Comic Sans MS",
        "Courier New",
        "Georgia",
        "Impact",
        "Segoe UI",
        "Tahoma",
        "Times New Roman",
        "Trebuchet MS",
        "Verdana",
      ].map((fontId) => ({ fontId, displayName: fontId }));
      cb?.(fonts);
      return Promise.resolve(fonts);
    },
    onFontChanged: new EventHub().toApi(),
  };

  return {
    i18n,
    identity,
    commands,
    omnibox,
    contentSettings: {},
    proxy,
    system,
    power,
    management,
    webNavigation,
    tts,
    clipboard,
    fontSettings,
    app: {
      getDetails: () => null,
      isInstalled: false,
      InstallState: {
        DISABLED: "disabled",
        INSTALLED: "installed",
        NOT_INSTALLED: "not_installed",
      },
      RunningState: {
        CANNOT_RUN: "cannot_run",
        READY_TO_RUN: "ready_to_run",
        RUNNING: "running",
      },
    },
    csi: () => ({}),
    loadTimes: () => ({}),
  };
}
