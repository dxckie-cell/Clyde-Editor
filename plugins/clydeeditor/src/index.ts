import { findByStoreName, findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { showToast } from "@vendetta/ui/toasts";
import { dlog, hit } from "./debug";
import Settings from "./Settings";

const VERSION = "1.1.0-debug";

const CLYDE_ID = "1";

// placeholder banner hash, only used so the profile UI renders a banner area
// for Clyde (who has no banner of his own); the real image comes from the override
const PLACEHOLDER_HASH = "clyde-editor-banner";

const UserStore = findByStoreName("UserStore");
const AvatarUtils = findByProps("getUserAvatarSource");
const patches: (() => void)[] = [];

// users and profiles we put a placeholder banner on, with what it was before
const injected = new Map<any, any>();

// display profiles (what the profile screen reads) that are already handled
const handledProfiles = new WeakSet<object>();

// looks up the banner at call time so edits in settings apply without reloading
function getBannerOverride(userId?: string): string | undefined {
  if (userId !== CLYDE_ID) return undefined;
  const url = typeof storage.banner === "string" ? storage.banner.trim() : "";
  return url || undefined;
}

// wraps obj[key] so that `wrapper(original, self, args)` runs instead, and
// registers a function that puts the original back on unload
function wrap(obj: any, key: string, wrapper: (original: Function, self: any, args: any[]) => any): boolean {
  try {
    const original = obj?.[key];
    if (typeof original !== "function") return false;

    obj[key] = function (this: any, ...args: any[]) {
      return wrapper(original, this, args);
    };
    patches.push(() => { obj[key] = original; });
    return true;
  } catch (e) {
    dlog(`wrap(${key}) failed`, e);
    return false;
  }
}

// gives Clyde's user or profile a banner so the profile screen draws the banner
// area. changed in place (and restored on unload) so any methods keep working
function addPlaceholderBanner(target: any, userId: string | undefined, where: string): void {
  if (!target || !getBannerOverride(userId)) return;
  if (target.banner) {
    hit(`${where}: already has a banner, left alone`, { banner: target.banner });
    return;
  }
  try {
    injected.set(target, target.banner);
    target.banner = PLACEHOLDER_HASH;
    hit(`${where}: placeholder banner set`);
  } catch (e) {
    dlog(`${where}: could not set placeholder (frozen?)`, e);
  }
}

// the profile screen builds its banner from a "displayProfile" object, so
// that object's getBannerURL is pointed at the override
function patchDisplayProfile(profile: any, userId?: string): void {
  if (!profile || typeof profile !== "object" || handledProfiles.has(profile)) return;

  const id = userId ?? profile.userId;
  if (!getBannerOverride(id)) return;
  handledProfiles.add(profile);

  const original = profile.getBannerURL;
  dlog("displayProfile for Clyde found", {
    keys: Object.keys(profile).slice(0, 25),
    hasGetBannerURL: typeof original === "function",
    banner: profile.banner,
  });
  try {
    if (!profile.banner) {
      Object.defineProperty(profile, "banner", { value: PLACEHOLDER_HASH, configurable: true, writable: true, enumerable: true });
    }
    Object.defineProperty(profile, "getBannerURL", {
      value: function (...args: any[]) {
        // looked up again on every call so edits and removals apply at once
        const url = getBannerOverride(id);
        hit("displayProfile.getBannerURL called", { returning: url ?? "original", args });
        return url ?? (typeof original === "function" ? original.apply(profile, args) : undefined);
      },
      configurable: true,
      writable: true,
      enumerable: true,
    });
    dlog("displayProfile.getBannerURL patched");
  } catch (e) {
    dlog("displayProfile patch failed (frozen?)", e);
  }
}

// the hook the profile screen calls with { user, displayProfile, ... }
function bannerHookWrapper(original: Function, self: any, args: any[]) {
  // first few calls for anyone, to see what the profile screen passes in
  hit("profile hook called (any user)", args.map((a) => (a && typeof a === "object"
    ? { keys: Object.keys(a).slice(0, 12), userId: a.user?.id ?? a.userId }
    : typeof a)), 2);

  for (const arg of args) {
    if (arg && typeof arg === "object") {
      const id = arg.user?.id ?? arg.userId;
      if (id === CLYDE_ID) {
        hit("profile hook called for Clyde", { hasDisplayProfile: !!arg.displayProfile, keys: Object.keys(arg).slice(0, 12) });
      }
      if (arg.displayProfile) patchDisplayProfile(arg.displayProfile, arg.user?.id);
    }
  }
  return original.apply(self, args);
}

// getUserBannerURL and friends, for any screen that builds a banner URL itself
function makeUrlGetterWrapper(name: string) {
  return (original: Function, self: any, args: any[]) => {
    const first = args[0];
    const id = typeof first === "string" ? first : (first?.id ?? first?.userId);
    const url = getBannerOverride(id);
    if (id === CLYDE_ID) hit(`${name} called for Clyde`, { returning: url ?? "original", args });
    return url ?? original.apply(self, args);
  };
}

function patchUrlGetter(name: string): boolean {
  const mod = findByProps(name);
  if (!mod) {
    dlog(`${name}: module NOT FOUND`);
    return false;
  }
  const ok = wrap(mod, name, makeUrlGetterWrapper(name));
  dlog(`${name}: ${ok ? "patched" : "found but not a patchable function"}`);
  return ok;
}

// profile lookups: hands back the profile with a placeholder banner on it
function makeProfileWrapper(name: string) {
  return (original: Function, self: any, args: any[]) => {
    const profile = original.apply(self, args);
    if (args[0] === CLYDE_ID) {
      hit(`UserProfileStore.${name}(Clyde)`, { returned: profile ? Object.keys(profile).slice(0, 20) : profile });
      addPlaceholderBanner(profile, args[0], `UserProfileStore.${name}`);
    }
    return profile;
  };
}

// what the discord build exposes for banners, so a missing patch target is obvious
function probe(): void {
  const names = [
    "useUserProfileBannerBackgroundColor",
    "getUserBannerURL",
    "getGuildMemberBannerURL",
    "getUserBannerSource",
    "useUserBanner",
    "getBannerURL",
  ];
  dlog("probe", names.map((n) => `${n}=${findByProps(n) ? "found" : "missing"}`).join(", "));

  try {
    const user = UserStore?.getUser(CLYDE_ID);
    dlog("Clyde user", user
      ? { username: user.username, bot: user.bot, banner: user.banner, keys: Object.keys(user).slice(0, 20) }
      : "not in UserStore (open a DM with Clyde first)");
  } catch (e) {
    dlog("Clyde user lookup failed", e);
  }

  try {
    const UserProfileStore = findByStoreName("UserProfileStore");
    const profile = UserProfileStore?.getUserProfile?.(CLYDE_ID);
    dlog("Clyde profile", profile ? { banner: profile.banner, keys: Object.keys(profile).slice(0, 20) } : "none cached");
  } catch (e) {
    dlog("Clyde profile lookup failed", e);
  }
}

function patchBanner() {
  const url = getBannerOverride(CLYDE_ID);
  dlog("banner setting", url ? `"${url}"` : "EMPTY, nothing will be overridden");

  probe();

  // a placeholder left behind by an earlier load that was not unloaded
  try {
    const user = UserStore?.getUser(CLYDE_ID);
    if (user && user.banner === PLACEHOLDER_HASH) {
      user.banner = null;
      dlog("cleared a leftover placeholder from a previous load");
    }
  } catch {
    // nothing to clean up
  }

  // the profile screen's banner
  const hookModule = findByProps("useUserProfileBannerBackgroundColor");
  const hookOk = !!hookModule && wrap(hookModule, "useUserProfileBannerBackgroundColor", bannerHookWrapper);
  dlog("profile screen banner hook", hookOk ? "patched" : "NOT FOUND, banner will not show on the profile screen");

  // anything else that builds a banner URL
  const getters = ["getUserBannerURL", "getGuildMemberBannerURL"].filter(patchUrlGetter);
  dlog("banner URL functions patched", getters.length ? getters.join(", ") : "none");

  // profile stores, so Clyde still gets a banner drawn
  const UserProfileStore = findByStoreName("UserProfileStore");
  if (!UserProfileStore) {
    dlog("UserProfileStore NOT FOUND");
  } else {
    const a = wrap(UserProfileStore, "getUserProfile", makeProfileWrapper("getUserProfile"));
    const b = wrap(UserProfileStore, "getGuildMemberProfile", makeProfileWrapper("getGuildMemberProfile"));
    dlog("profile store", `getUserProfile=${a ? "patched" : "missing"}, getGuildMemberProfile=${b ? "patched" : "missing"}`);
  }

  // same for the user object itself
  const userOk = wrap(UserStore, "getUser", (original, self, args) => {
    const user = original.apply(self, args);
    if (args[0] === CLYDE_ID) {
      hit("UserStore.getUser(Clyde) [banner]", { found: !!user, banner: user?.banner });
      addPlaceholderBanner(user, args[0], "UserStore.getUser");
    }
    return user;
  });
  dlog("user store getUser", userOk ? "patched" : "NOT FOUND");

  // refresh ui so an existing banner override shows up right away
  try {
    const user = UserStore?.getUser(CLYDE_ID);
    if (user) {
      FluxDispatcher.dispatch({ type: "USER_UPDATE", user });
      dlog("dispatched USER_UPDATE for Clyde");
    }
  } catch (e) {
    dlog("USER_UPDATE dispatch failed", e);
  }
}

export default {
  onLoad() {
    try {
      dlog(`Clyde Editor ${VERSION} loading`, {
        UserStore: !!UserStore,
        AvatarUtils: !!AvatarUtils,
        name: storage.name,
        avatar: storage.avatar,
        banner: storage.banner,
      });

      storage.name ??= "";
      storage.avatar ??= "";
      storage.banner ??= "";

      if (UserStore) {
        patches.push(
          after("getUser", UserStore, ([id]: string[], user: any) => {
            if (id !== CLYDE_ID || !user || !storage.name) return;
            hit("renaming Clyde", storage.name, 1);
            user.username = storage.name;
            user.globalName = storage.name;
          })
        );
      }
      if (AvatarUtils) {
        patches.push(
          after("getUserAvatarSource", AvatarUtils, ([user]: any[], res: any) => {
            if (user?.id === CLYDE_ID && storage.avatar) {
              hit("swapping Clyde avatar", undefined, 1);
              return { uri: storage.avatar };
            }
          })
        );
      }
      if (UserStore) patchBanner();
      dlog("load finished");
    } catch (e) {
      dlog("onLoad error", e);
      showToast("Clyde Editor error, check the debug log in its settings");
    }
  },
  onUnload() {
    dlog("onUnload");
    // undone in reverse so patches stacked on the same function come off cleanly
    patches.splice(0).reverse().forEach((p) => p());

    injected.forEach((original, target) => {
      try { target.banner = original; } catch { /* nothing to restore */ }
    });
    injected.clear();
  },
  settings: Settings,
};
