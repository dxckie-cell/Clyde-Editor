import { findByStoreName, findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { showToast } from "@vendetta/ui/toasts";
import { dlog } from "./debug";
import Settings from "./Settings";

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
    dlog(`could not patch ${key}`, e);
    return false;
  }
}

// gives Clyde's user a banner so the profile screen draws the banner area.
// changed in place (and restored on unload) so any methods keep working
function addPlaceholderBanner(target: any, userId?: string): void {
  if (!target || target.banner || !getBannerOverride(userId)) return;
  try {
    injected.set(target, target.banner);
    target.banner = PLACEHOLDER_HASH;
  } catch (e) {
    dlog("could not set placeholder banner (frozen object?)", e);
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
  try {
    if (!profile.banner) {
      Object.defineProperty(profile, "banner", { value: PLACEHOLDER_HASH, configurable: true, writable: true, enumerable: true });
    }
    Object.defineProperty(profile, "getBannerURL", {
      value: function (...args: any[]) {
        // looked up again on every call so edits and removals apply at once
        return getBannerOverride(id) ?? (typeof original === "function" ? original.apply(profile, args) : undefined);
      },
      configurable: true,
      writable: true,
      enumerable: true,
    });
  } catch (e) {
    dlog("could not patch the display profile (frozen object?)", e);
  }
}

// Clyde is a system user and has no profile in the store, so the profile screen
// has nothing to draw a banner from. this is a minimal stand-in that carries one
function makeStandInProfile(id: string): any {
  return {
    userId: id,
    banner: PLACEHOLDER_HASH,
    bio: "",
    accentColor: null,
    themeColors: undefined,
    badges: [],
    connectedAccounts: [],
    getBannerURL: () => getBannerOverride(id),
  };
}

// the hook the profile screen calls with { user, displayProfile, ... }
function bannerHookWrapper(original: Function, self: any, args: any[]) {
  let standIn = false;
  const callArgs = args.map((arg) => {
    if (!arg || typeof arg !== "object") return arg;

    if (arg.displayProfile) {
      patchDisplayProfile(arg.displayProfile, arg.user?.id);
      return arg;
    }
    // Clyde arrives without a displayProfile: hand the hook a stand-in that has the banner
    if ((arg.user?.id ?? arg.userId) === CLYDE_ID && getBannerOverride(CLYDE_ID)) {
      standIn = true;
      return { ...arg, displayProfile: makeStandInProfile(CLYDE_ID) };
    }
    return arg;
  });
  if (!standIn) return original.apply(self, args);

  try {
    return original.apply(self, callArgs);
  } catch (e) {
    dlog("profile hook failed with the stand-in profile, using the original", e);
    return original.apply(self, args);
  }
}

// getUserBannerURL and friends, for any screen that builds a banner URL itself
function urlGetterWrapper(original: Function, self: any, args: any[]) {
  const first = args[0];
  const id = typeof first === "string" ? first : (first?.id ?? first?.userId);
  return getBannerOverride(id) ?? original.apply(self, args);
}

function patchUrlGetter(name: string): boolean {
  const mod = findByProps(name);
  return !!mod && wrap(mod, name, urlGetterWrapper);
}

// profile lookups: Clyde has none, so he gets a stand-in carrying the banner
function profileWrapper(original: Function, self: any, args: any[]) {
  const profile = original.apply(self, args);
  if (args[0] !== CLYDE_ID || !getBannerOverride(CLYDE_ID)) return profile;
  if (!profile && original === originalGetUserProfile) return makeStandInProfile(CLYDE_ID);
  addPlaceholderBanner(profile, args[0]);
  return profile;
}

let originalGetUserProfile: Function | undefined;

function patchBanner() {
  // a placeholder left behind by an earlier load that was not unloaded
  try {
    const user = UserStore?.getUser(CLYDE_ID);
    if (user && user.banner === PLACEHOLDER_HASH) user.banner = null;
  } catch {
    // nothing to clean up
  }

  const hookModule = findByProps("useUserProfileBannerBackgroundColor");
  const hookOk = !!hookModule && wrap(hookModule, "useUserProfileBannerBackgroundColor", bannerHookWrapper);

  const getters = ["getUserBannerURL", "getGuildMemberBannerURL"].filter(patchUrlGetter);

  const UserProfileStore = findByStoreName("UserProfileStore");
  originalGetUserProfile = UserProfileStore?.getUserProfile;
  const profilesOk = !!UserProfileStore && [
    wrap(UserProfileStore, "getUserProfile", profileWrapper),
    wrap(UserProfileStore, "getGuildMemberProfile", profileWrapper),
  ].some(Boolean);

  const userOk = wrap(UserStore, "getUser", (original, self, args) => {
    const user = original.apply(self, args);
    if (args[0] === CLYDE_ID) addPlaceholderBanner(user, args[0]);
    return user;
  });

  // one line that says what was found, so a missing patch target is obvious
  dlog("banner patches", {
    profileHook: hookOk ? "ok" : "MISSING",
    urlGetters: getters.length ? getters.join(", ") : "MISSING",
    profileStore: profilesOk ? "ok" : "MISSING",
    userStore: userOk ? "ok" : "MISSING",
  });

  // refresh ui so an existing banner override shows up right away
  try {
    const user = UserStore?.getUser(CLYDE_ID);
    if (user) FluxDispatcher.dispatch({ type: "USER_UPDATE", user });
  } catch {
    // the next time the profile opens will show it anyway
  }
}

export default {
  onLoad() {
    try {
      storage.name ??= "";
      storage.avatar ??= "";
      storage.banner ??= "";

      dlog("loaded", {
        name: storage.name || "(default)",
        avatar: storage.avatar ? "set" : "(default)",
        banner: storage.banner ? "set" : "(default)",
      });

      if (UserStore) {
        patches.push(
          after("getUser", UserStore, ([id]: string[], user: any) => {
            if (id !== CLYDE_ID || !user || !storage.name) return;
            user.username = storage.name;
            user.globalName = storage.name;
          })
        );
      } else {
        dlog("UserStore not found, nothing patched");
      }
      if (AvatarUtils) {
        patches.push(
          after("getUserAvatarSource", AvatarUtils, ([user]: any[]) => {
            if (user?.id === CLYDE_ID && storage.avatar) return { uri: storage.avatar };
          })
        );
      } else {
        dlog("avatar function not found");
      }
      if (UserStore) patchBanner();
    } catch (e) {
      dlog("error on load", e);
      showToast("Clyde Editor error, check the debug log in its settings");
    }
  },
  onUnload() {
    // undone in reverse so patches stacked on the same function come off cleanly
    patches.splice(0).reverse().forEach((p) => p());

    injected.forEach((original, target) => {
      try { target.banner = original; } catch { /* nothing to restore */ }
    });
    injected.clear();
  },
  settings: Settings,
};
