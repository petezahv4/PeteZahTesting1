export const NEGATIVE = "... /ᐠ - ˕ -マ";

function messageBase(mutMessage: string): string {
  let message = mutMessage.trimEnd();
  while (message.endsWith(NEGATIVE)) {
    message = message.slice(0, -NEGATIVE.length).trimEnd();
  }
  return message.replace(/[.!]+$/g, "");
}

export function negativeMessage(message: string): string {
  return `${messageBase(message)}${NEGATIVE}`;
}
