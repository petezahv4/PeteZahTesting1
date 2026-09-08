import type { DNRDecision, DNRRule } from "./types";
import type { ExtensionState, RivetRegistry } from "./registry";

export function recomputeStaticRules(ext: ExtensionState): void {
  ext.staticRules = [];
  for (const id of ext.enabledRulesetIds) {
    const rules = ext.rulesetRules.get(id);
    if (rules) ext.staticRules.push(...rules);
  }
}

function ruleMatchesUrl(rule: DNRRule, requestUrl: string): boolean {
  const cond = rule.condition;
  if (cond.urlFilter) {
    const pattern = cond.urlFilter
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\|\|/g, "(?:https?://)(?:[^/]*\\.)?")
      .replace(/\^/g, "[/?&#]");
    try {
      if (!new RegExp(pattern, "i").test(requestUrl)) return false;
    } catch {
      return false;
    }
  }
  if (cond.regexFilter) {
    try {
      if (!new RegExp(cond.regexFilter, "i").test(requestUrl)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function ruleMatchesResourceType(rule: DNRRule, resourceType?: string): boolean {
  if (!rule.condition.resourceTypes?.length) return true;
  return resourceType ? rule.condition.resourceTypes.includes(resourceType) : false;
}

function ruleMatchesInitiator(rule: DNRRule, initiatorUrl?: string): boolean {
  const cond = rule.condition;
  if (!initiatorUrl) return !cond.initiatorDomains?.length;
  let initHost: string;
  try {
    initHost = new URL(initiatorUrl).hostname;
  } catch {
    return !cond.initiatorDomains?.length;
  }
  if (cond.initiatorDomains?.length && !cond.initiatorDomains.some((d) => initHost === d || initHost.endsWith(`.${d}`))) {
    return false;
  }
  if (cond.excludedInitiatorDomains?.some((d) => initHost === d || initHost.endsWith(`.${d}`))) {
    return false;
  }
  return true;
}

export function checkDeclarativeNetRequest(
  registry: RivetRegistry,
  requestUrl: string,
  initiatorUrl?: string,
  resourceType?: string,
): DNRDecision | null {
  for (const ext of registry.list()) {
    if (!ext.enabled) continue;
    const rules = [...ext.dynamicRules, ...ext.staticRules].sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1));
    for (const rule of rules) {
      if (!ruleMatchesUrl(rule, requestUrl)) continue;
      if (!ruleMatchesResourceType(rule, resourceType)) continue;
      if (!ruleMatchesInitiator(rule, initiatorUrl)) continue;

      const action = rule.action;
      if (action.type === "block") return { action: "block" };
      if (action.type === "redirect") {
        const redirectUrl = action.redirect?.url ?? action.redirect?.regexSubstitution;
        if (redirectUrl) return { action: "redirect", url: redirectUrl };
      }
      if (action.type === "upgradeScheme") {
        return { action: "redirect", url: requestUrl.replace(/^http:/, "https:") };
      }
      if (action.type === "modifyHeaders") {
        return { action: "modifyHeaders", headers: action.requestHeaders ?? [], responseHeaders: action.responseHeaders ?? [] };
      }
    }
  }
  return null;
}
