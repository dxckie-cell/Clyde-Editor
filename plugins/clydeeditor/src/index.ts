import { findByStoreName, findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { showToast } from "@vendetta/ui/toasts";
import Settings from "./Settings";

console.log("[ClydeEditor] index evaluated", { settings: typeof Settings });

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
  } catch {
    return false;
  }
}

// gives Clyde's user or profile a banner so the profile screen draws the banner
// area. changed in place (and restored on unload) so any methods keep working
function addPlaceholderBanner(target: any, userId?: string): void {
  if (!target || target.banner || !getBannerOverride(userId)) return;
  try {
    injected.set(target, target.banner);
    target.banner = PLACEHOLDER_HASH;
  } catch {
    // frozen objects are left alone
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
  } catch {
    // frozen objects are left alone
  }
}

// the hook the profile screen calls with { user, displayProfile, ... }
function bannerHookWrapper(original: Function, self: any, args: any[]) {
  for (const arg of args) {
    if (arg && typeof arg === "object" && arg.displayProfile) {
      patchDisplayProfile(arg.displayProfile, arg.user?.id);
    }
  }
  return original.apply(self, args);
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

// profile lookups: hands back the profile with a placeholder banner on it
function profileWrapper(original: Function, self: any, args: any[]) {
  const profile = original.apply(self, args);
  addPlaceholderBanner(profile, args[0]);
  return profile;
}

function patchBanner() {
  // a placeholder left behind by an earlier load that was not unloaded
  try {
    const user = UserStore?.getUser(CLYDE_ID);
    if (user && user.banner === PLACEHOLDER_HASH) user.banner = null;
  } catch {
    // nothing to clean up
  }

  // the profile screen's banner
  const hookModule = findByProps("useUserProfileBannerBackgroundColor");
  const hookOk = !!hookModule && wrap(hookModule, "useUserProfileBannerBackgroundColor", bannerHookWrapper);
  console.log("[ClydeEditor] profile screen banner:", hookOk ? "patched" : "NOT FOUND, banner will not show there");

  // anything else that builds a banner URL
  const getters = ["getUserBannerURL", "getGuildMemberBannerURL"].filter(patchUrlGetter);
  console.log("[ClydeEditor] banner URL functions patched:", getters.length ? getters.join(", ") : "none");

  // profile stores, so Clyde still gets a banner drawn
  const UserProfileStore = findByStoreName("UserProfileStore");
  const profilesOk = !!UserProfileStore && [
    wrap(UserProfileStore, "getUserProfile", profileWrapper),
    wrap(UserProfileStore, "getGuildMemberProfile", profileWrapper),
  ].some(Boolean);
  console.log("[ClydeEditor] profile store:", profilesOk ? "patched" : "NOT FOUND");

  // same for the user object itself
  const userOk = wrap(UserStore, "getUser", (original, self, args) => {
    const user = original.apply(self, args);
    addPlaceholderBanner(user, args[0]);
    return user;
  });
  console.log("[ClydeEditor] user store banner:", userOk ? "patched" : "NOT FOUND");

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
      console.log("[ClydeEditor] onLoad", {
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
            console.log("[ClydeEditor] renaming Clyde to", storage.name);
            user.username = storage.name;
            user.globalName = storage.name;
          })
        );
      }
      if (AvatarUtils) {
        patches.push(
          after("getUserAvatarSource", AvatarUtils, ([user]: any[], res: any) => {
            if (user?.id === CLYDE_ID && storage.avatar) {
              console.log("[ClydeEditor] swapping Clyde avatar");
              return { uri: storage.avatar };
            }
          })
        );
      }
      if (UserStore) patchBanner();
    } catch (e) {
      console.log("[ClydeEditor] onLoad error", e);
      showToast("Clyde Editor error, check logs");
    }
  },
  onUnload() {
    console.log("[ClydeEditor] onUnload");
    // undone in reverse so patches stacked on the same function come off cleanly
    patches.splice(0).reverse().forEach((p) => p());

    injected.forEach((original, target) => {
      try { target.banner = original; } catch { /* nothing to restore */ }
    });
    injected.clear();
  },
  settings: Settings,
};
