
import { extensionNetworkUrl, shouldRoute, route } from "./RivetRouter";

declare const self: ServiceWorkerGlobalScope;

(self as unknown as { $rivetRouter: { extensionNetworkUrl: typeof extensionNetworkUrl; shouldRoute: typeof shouldRoute; route: typeof route } }).$rivetRouter = {
  extensionNetworkUrl,
  shouldRoute,
  route,
};
