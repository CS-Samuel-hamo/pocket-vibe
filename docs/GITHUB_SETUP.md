# GitHub Setup

## Repository

- URL: https://github.com/CS-Samuel-hamo/pocket-vibe
- Default branch: `main`
- License: MIT

## Normal push (when github.com is reachable)

```powershell
git remote set-url origin https://github.com/CS-Samuel-hamo/pocket-vibe.git
git push --set-upstream origin main
```

Authentication uses GitHub CLI (`gh auth login`).

## If git push fails with connection reset

Some networks can reach `api.github.com` but not `github.com:443`. Use the API fallback from the parent workspace:

```powershell
powershell -ExecutionPolicy Bypass -File ..\tools\push_via_gh_api.ps1 `
  -RepoPath . `
  -Repo CS-Samuel-hamo/pocket-vibe `
  -Branch main
```

This uploads the latest commit snapshot. Full git history still requires a working `github.com` connection or a proxy.

## Create a release

```powershell
gh release create v0.1.0-mobile-codex-mvp `
  --repo CS-Samuel-hamo/pocket-vibe `
  --title "Pocket Vibe v0.1.0-mobile-codex-mvp" `
  --notes-file RELEASE_NOTES.md
```
