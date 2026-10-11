# Clyde Editor

Revenge / Vendetta plugins that change how Discord's built-in accounts look on your client.
This fork adds a **banner override** to Clyde Editor.

## Clyde Editor

Change Clyde's **name**, **profile picture** and **banner**.

Install by pasting this into the Install Plugin box of your client:

```
https://dxckie-cell.github.io/Clyde-Editor/clydeeditor/
```

Open the plugin's settings and fill in any of:

| Field | What to enter |
| --- | --- |
| Name | Any text |
| Avatar | Direct image link (`.png`, `.jpg`, `.gif`) |
| Banner | Direct image link (`.png`, `.jpg`, `.gif`) |

Leave a field empty to keep Clyde's default. At the bottom of the settings there is a small debug log with
Copy and Clear buttons. If a banner does not show, its `banner patches` line says which part of Discord the
plugin could not find.

## Other plugins in this repo

| Plugin | What it does | Install URL |
| --- | --- | --- |
| Discord Editor | Modify the official Discord account | `https://dxckie-cell.github.io/Clyde-Editor/discordeditor/` |
| Deleted User Editor | Modify Deleted Users' names and profile pictures | `https://dxckie-cell.github.io/Clyde-Editor/deletededitor/` |
| CommandTest V6 | Command test plugin | `https://dxckie-cell.github.io/Clyde-Editor/classiclearn/` |

A banner-enabled Discord Editor also lives in [dxckie-cell/Discord-Editor](https://github.com/dxckie-cell/Discord-Editor).

## Changes in this fork

- Banner override for Clyde Editor, plus the in-app debug log (by [dxckie-cell](https://github.com/dxckie-cell)).

## Credits

- **[thesillyuluv](https://github.com/thesillyuluv)** wrote the plugins in this repo (Clyde Editor, Discord Editor,
  Deleted User Editor and CommandTest V6). This is a fork of their
  [sillystuff](https://github.com/thesillyuluv/sillystuff) repository.
- **kmmiio99o** is credited in the build template's `base_manifest.json`, which this repo's build setup comes from.
- The banner approach follows [dxckie-cell/Override-User-Banners](https://github.com/dxckie-cell/Override-User-Banners).

## Build

```
bun install
bun run build   # writes dist/<plugin>/
```

Pushing to `main` builds and publishes to GitHub Pages (Settings → Pages, source `gh-pages`).

## License

GPL-3.0, see [LICENSE](LICENSE).
