# Jastica — Frontend (GitHub Pages)

Tampilan aplikasi **Jastica** (jasa titip & keuangan) untuk pelanggan dan pengurus. Halaman ini statis (HTML, CSS, JavaScript) dan mengambil semua data dari backend **Google Apps Script** lewat API JSON.

## Struktur

```
index.html        halaman utama (wajib di paling luar repository)
css/style.css     seluruh gaya: tema terang/gelap, responsif, cetak
js/config.js      satu-satunya pengaturan: GAS_URL (URL /exec Apps Script)
js/app.js         logika aplikasi (SPA)
.nojekyll         GitHub Pages menyajikan file apa adanya
```

## Pengaturan

Buka `js/config.js` dan isi `GAS_URL` dengan **URL aplikasi web** dari Apps Script (Terapkan → Kelola deployment, berakhiran `/exec`). URL ini bukan rahasia. Jangan menaruh token, kunci API, atau kata sandi di repository ini; semua rahasia tersimpan di Script Properties Apps Script.

## Memperbarui

```bash
git add .
git commit -m "Perbarui frontend"
git push
```

GitHub Pages memperbarui situs dalam 1–2 menit. Bila masih tampil versi lama, tekan Ctrl+Shift+R.

Panduan lengkap (backend, GitHub Pages, fitur, pemecahan masalah): `PANDUAN-INSTALASI.md`.
