# Môj web

Osobný web trénera – úvod, o mne, služby a cenník, ako to prebieha a kontakt.
Čistý HTML + CSS, bez frameworku a bez servera.

## Úprava textov
Všetky texty sú v `index.html`. Miesta, ktoré treba doplniť (meno, telefón, e-mail, mesto, Instagram),
sú označené hranatými zátvorkami, napr. `[Tvoje meno]`.
Farby a písmo sa menia v `css/styles.css` (premenné na začiatku súboru).

## Spustenie
```bash
npx http-server .
```
a otvoriť `http://localhost:8080`.

## Zverejnenie cez GitHub Pages
1. V repozitári otvor **Settings → Pages** a nastav **Source: GitHub Actions** (stačí raz).
2. Každý push do vetvy `main` web automaticky nasadí (`.github/workflows/pages.yml`).
3. Web bude na adrese `https://<používateľ>.github.io/lift-tara/`.

> Pozn.: GitHub Pages zo súkromného repozitára vyžaduje platený plán (GitHub Pro).
> Na bezplatnom účte treba repozitár prepnúť na verejný, alebo použiť Netlify / Cloudflare Pages.
