export function encodeMochiTarget(url: string): string {
  const key = "q7Zx!9pL";
  const encoded = encodeURIComponent(url);
  let binary = "";
  for (let index = 0; index < encoded.length; index++) {
    binary += String.fromCharCode(encoded.charCodeAt(index) ^ key.charCodeAt(index % key.length));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
