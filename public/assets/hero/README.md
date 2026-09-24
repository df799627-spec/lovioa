# Locale-specific hero images

Place locale-specific assets here. File naming convention:

```
hero/bg.png       ← English / default fallback
hero/bg.zh.png    ← Chinese (zh)
```

The `useLocale()` hook in `src/hooks/useLocale.js` will automatically resolve
the correct file based on the user's current locale.

You can add more locales by updating `LOCALE_SUFFIX` in that file.

## Recommended image specs

- `hero/bg.png` — full-bleed background art, 1600 × 900 px, PNG or WebP
- Apply a subtle overlay/mix-blend-mode so text remains legible