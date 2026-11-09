# Jastica — Panduan Instalasi & Deployment (Apps Script + GitHub Pages)

Versi **1.4.1**. Jastica adalah aplikasi web satu halaman (SPA) untuk jasa titip Jakarta, Malaysia, Singapura, Jepang dan Thailand: pesanan, konversi kurs ke IDR, jasa titip, dompet kas, pembayaran (transfer, QRIS & e-wallet), invoice PDF dan gambar JPG ke WhatsApp, pengingat tagihan, poin & voucher member, katalog dengan nama barang otomatis dari foto, keamanan masuk (OTP pengurus, member masuk dengan PIN 6 digit, keluar otomatis), laporan, harga jual katalog dan rincian keuntungan, sisa stok, ulasan member, impor barang dari Excel, serta galeri foto barang, varian warna/ukuran/berat, dan jasa titip per barang.

## Arsitektur (mulai 1.4)

```
GitHub Pages (frontend statis)                      Google Apps Script (backend)
https://USERNAME.github.io/NAMA-REPO/               https://script.google.com/macros/s/…/exec
  index.html, css/style.css, js/app.js   ── fetch ──▶  doPost / doGet → JSON (REST API)
  js/config.js → GAS_URL                 ◀── JSON ───  Google Sheets, Drive, Gmail, CacheService
```

- **Frontend** (tampilan) dibuka pelanggan & pengurus di alamat GitHub Pages: lebih cepat, tanpa bingkai/iframe Google, dan kamera/unduhan/cetak berjalan normal.
- **Backend** tetap di Apps Script dan Google Sheets yang sama, tetapi kini hanya mengirim data JSON. Membuka URL `/exec` langsung hanya menampilkan teks JSON "API Jastica aktif".
- Satu-satunya penghubung keduanya: **`GAS_URL`** di `js/config.js`. URL `/exec` bukan rahasia; keamanan dijaga token sesi dan pemeriksaan peran di server. Semua rahasia (token Fonnte, kunci Gemini, hash sandi/PIN) tetap hanya di Script Properties dan Sheets.

## Isi paket

| Berkas | Untuk | Isi |
|---|---|---|
| `Kode.gs` (berkas terpisah) | Editor Apps Script | Backend REST API: `doPost`/`doGet` JSON, dispatcher `api()`, RBAC, sesi satu perangkat & batas diam, OTP pengurus, PIN member, harga & kurs, poin & voucher, QRIS & e-wallet, pengenalan foto (Gemini), stok, ulasan, impor barang, varian & jasa titip per barang, galeri foto, invoice PDF/JPG, WhatsApp/email bertemplate, trigger, auto-setup |
| `jastica-web.zip` | Repository GitHub (GitHub Pages) | Frontend siap unggah: `index.html`, `css/style.css`, `js/config.js` (isi `GAS_URL`), `js/app.js`, `.nojekyll`, `README.md`, salinan panduan ini |
| `PANDUAN-INSTALASI.md` | Dibaca | Panduan ini |

---

## 0. Memperbarui dari versi sebelumnya (1.0.x sampai 1.4.0)

Lewati bagian ini jika memasang dari nol.

**Dari 1.4.0 (sudah di GitHub Pages).**
1. Apps Script: ganti isi file **`Kode`** dengan `Kode.gs` baru → **Terapkan → Kelola deployment → ✏️ Edit → Versi: Versi baru → Terapkan**. URL `/exec` tetap sama.
2. Frontend: ekstrak `jastica-web-update.zip` ke folder proyek Anda (misalnya `Documents\jastica-web`) dan pilih **timpa/replace**. Paket pembaruan **tidak berisi `js/config.js`**, jadi `GAS_URL` Anda tetap aman.
3. Dari folder itu: `git add .` → `git commit -m "Jastica 1.4.1"` → `git push`. Tunggu 1–2 menit, lalu **Ctrl+Shift+R**.

**Pindah ke GitHub Pages (dari 1.3.x atau lebih lama), tanpa aplikasi berhenti.** Database, akun, dan semua data tetap sama; yang berubah hanya tempat tampilan aplikasi dibuka. Setiap deployment Apps Script terkunci pada versinya sendiri, jadi alamat lama tetap melayani aplikasi lama sampai alamat GitHub Pages siap.

1. Di editor Apps Script, ganti isi file **`Kode`** dengan `Kode.gs` dari paket ini (cara menyalin di bagian 1). Cocokkan nomor baris terakhir dengan tabel di bagian 1.
2. **Hapus** file HTML lama **`Index`**, **`Stylesheet`**, dan **`JavaScript`** (klik ⋮ di samping nama file → **Hapus**). Ketiganya tidak dipakai lagi. Deployment lama tidak terpengaruh karena memakai salinan versinya sendiri.
3. Simpan, lalu **Terapkan → Deployment baru → Aplikasi web**, **Jalankan sebagai: Saya**, **Yang memiliki akses: Siapa saja** → **Terapkan**. Salin URL `/exec` **baru** ini; inilah `GAS_URL`.
4. Buka URL baru itu di browser. Hasil yang benar berupa teks JSON yang memuat `"API Jastica aktif"`.
5. Pasang frontend di GitHub Pages dengan URL baru tadi (bagian 3.2), lalu uji: masuk sebagai pengurus dan sebagai member.
6. Bagikan alamat `https://USERNAME.github.io/NAMA-REPO/` ke member dan pengurus. Karena alamatnya berubah, setiap orang perlu **masuk sekali lagi** di alamat baru (sesi lama tidak terbawa). Data, PIN, dan kata sandi tidak berubah.
7. Setelah semua pindah, nonaktifkan alamat lama: **Terapkan → Kelola deployment** → pilih deployment lama → **Arsipkan**. Jika aplikasi pernah ditanam di Blogger, ganti alamatnya (bagian 17).

**Perubahan database** terjadi otomatis saat permintaan pertama ke server. Data lama tidak diubah dan **tidak perlu** menjalankan `setupAppEnvironment` lagi:    - Dari 1.0.x: sheet **Vouchers** dan **PoinLog** ditambahkan, serta kolom baru di **Customers** dan **Orders**.
   - Dari 1.1.x: tidak ada sheet atau kolom baru untuk 1.2.
   - Dari 1.2.x: sheet **PinPerangkat** (data masuk cepat member, berisi hash) dan kolom **Foto** di **Customers** ditambahkan.
   - Dari 1.3.0: tidak ada sheet, kolom, atau baris baru. QRIS dan e-wallet yang sudah tersimpan tetap dipakai.
   - Dari 1.3.1: tidak ada sheet, kolom, baris, atau properti baru untuk 1.3.2.
   - Dari 1.3.2: kolom **HargaJual** ditambahkan otomatis di sheet **Items** dan **OrderItems**. Data lama tidak berubah: barang dan pesanan lama tetap memakai harga toko (margin Rp 0) sampai Anda mengisi harga jual.
   - Dari 1.3.3: sheet **Reviews** (ulasan), kolom **Stok** dan **StokSejak** di sheet **Items**, serta folder Drive **Foto Ulasan** dibuat otomatis. Barang lama tidak dibatasi stoknya sampai Anda mengisi sisa stok.
   - Dari 1.3.5 dan 1.4.0: tidak ada sheet, kolom, atau properti baru untuk 1.4.x.
   - Dari 1.3.4: kolom **PinHash**, **PinSalt**, **Foto** di sheet **Users** serta **FotoLain**, **Varian**, **JasaItem** di sheet **Items** dibuat otomatis. Member lama tetap bisa masuk: PIN masuk cepat lama langsung menjadi PIN akun, atau masuk sekali dengan kata sandi lama lalu wajib membuat PIN 6 angka (lihat bagian 13).
4. Hal yang terjadi otomatis saat pembaruan:
   - Kurir **"Ambil di tempat"** dihapus dari daftar kurir, karena sekarang sudah ada pilihan **Ambil sendiri (pick up)** bawaan. Kurir lain tidak berubah.
   - Peran **Owner** mendapat izin baru: *Voucher & poin member* (1.1), serta *Atur jenis dompet* dan *Kelola QRIS pembayaran* (1.2). Super Admin bisa mencabutnya di matriks hak akses (Manajemen User). Matriks kini menampilkan izin baru ini tercentang, jadi menyimpan ulang matriks tidak mencabutnya tanpa sengaja.
   - (Dari 1.0.x) Poin hanya dihitung untuk pesanan yang dibuat **sejak tanggal pembaruan**.
   - (1.3) **OTP untuk pengurus tetap mati** sampai Super Admin menyalakannya (bagian 8). Pengurus dan member yang sedang masuk tidak perlu masuk ulang, tetapi sejak pembaruan berlaku **keluar otomatis setelah 5 menit tanpa aktivitas**.
   - (1.3) Template pesan yang sudah tersimpan tetap dipakai. Untuk memakai teks baru yang lebih rapi, buka **Pengaturan → Template pesan** lalu tekan **Kembalikan bawaan** pada template itu.
   - Semua pengaturan lain (aturan jasa, rekening, user, data) tetap seperti sebelumnya.
5. Periksa WhatsApp dengan langkah di bagian 5. Untuk fitur 1.2, pasang **kunci AI Gemini** dan tambahkan **QRIS** (bagian 7). Untuk fitur 1.3, tambahkan **e-wallet**, lengkapi **nomor WhatsApp/email pengurus**, lalu nyalakan **OTP pengurus** bila diinginkan (bagian 8).

Jangan mengganti nama sheet `Vouchers`, `PoinLog`, dan `PinPerangkat` di spreadsheet.

---

## 1. Pasang backend (Apps Script)

> **Salin dari komputer, bukan HP.** Buka `Kode.gs` dengan editor teks biasa, jangan dengan browser:
> - **Windows:** klik kanan file → *Open with* → **Notepad**.
> - **Mac:** pakai VS Code atau TextEdit.
>
> Di editor teks tekan **Ctrl+A** lalu **Ctrl+C**. Di editor Apps Script klik di dalam file `Kode`, tekan **Ctrl+A** (agar isi bawaan ikut terganti) lalu **Ctrl+V**.

1. Buka **https://script.google.com** → **Proyek baru**. Beri nama proyek, misalnya `Jastica`.
2. Hapus isi `Code.gs`, tempel isi **`Kode.gs`**, lalu ganti nama file menjadi **`Kode`**. Hanya file ini yang dibutuhkan di Apps Script; tidak ada file HTML.
3. Simpan (Ctrl+S), lalu cocokkan nomor baris terakhir yang berisi teks di editor Apps Script (baris kosong di bawahnya boleh diabaikan):

| File di Apps Script | Nomor baris | Isi baris itu |
|---|---|---|
| `Kode` | 4293 | `}` |

Jika angkanya berbeda, salinan belum lengkap. Ulangi Ctrl+A → Ctrl+V.

## 2. Jalankan auto-setup

1. Di bilah atas, pilih fungsi **`setupAppEnvironment`** → klik **▶ Jalankan**.
2. Berikan izin saat diminta (Sheets, Drive, Gmail/MailApp, layanan eksternal untuk kurs & WhatsApp, trigger).
3. Buka **Log eksekusi**. Setup akan:
   - membuat folder **Jastica** di Drive beserta sub-folder (Bukti Transfer, Struk Pembelian, Invoice PDF, Foto Barang, Aset Aplikasi, Backup);
   - membuat spreadsheet database dengan semua sheet;
   - mengisi pengaturan bawaan dan data contoh (4 dompet, 4 trip, 12 barang katalog, 5 customer, 16 pesanan);
   - memasang 3 trigger: kurs tiap jam, pengingat tagihan 09.00 WIB, cadangan database 02.00 WIB;
   - mencetak **akun Super Admin**:

```
🔐 AKUN SUPER ADMIN (catat sekarang — hanya tampil sekali, wajib ganti setelah login pertama)
   Username   : superadmin
   Kata sandi : XXXXXXXXXXXX
```

> Catat sandi itu sekarang. Saat login pertama, aplikasi memaksa Anda menggantinya. Setup aman dijalankan ulang: data, rahasia, dan akun yang sudah ada tidak ditimpa.

## 3. Deploy backend & pasang frontend

### 3.1 Deploy backend sebagai Web App (API)

1. **Terapkan → Deployment baru** → ikon roda gigi → **Aplikasi web**.
2. **Jalankan sebagai: Saya**.
3. **Yang memiliki akses: Siapa saja** (wajib: frontend di GitHub Pages memanggil API tanpa akun Google).
4. **Terapkan** → salin **URL aplikasi web** yang berakhiran `/exec`.
5. Uji: buka URL itu di browser. Hasil yang benar berupa teks JSON yang memuat `"success":true` dan `"API Jastica aktif"`.

**Saat kode backend diubah:** gunakan **Terapkan → Kelola deployment → ✏️ Edit → Versi: Versi baru → Terapkan**. Cara ini membuat URL tetap sama, sehingga `GAS_URL` di frontend tidak perlu diganti. "Deployment baru" akan menghasilkan URL baru.

### 3.2 Pasang frontend di GitHub Pages

Semua perintah di bawah diketik di **PowerShell** (Windows) atau **Terminal** (Mac). Jalankan satu per satu dan periksa hasilnya sebelum lanjut.

**a. Siapkan folder frontend.** Ekstrak `jastica-web.zip`. Folder hasil ekstrak, misalnya `Documents\jastica-web`, **itulah folder proyek** yang nanti dikirim ke GitHub. Isinya harus seperti ini (jangan masuk lebih dalam, jangan naik satu level):

```
jastica-web\
├── index.html          ← wajib ada di paling luar
├── README.md
├── PANDUAN-INSTALASI.md
├── css\
│   └── style.css
└── js\
    ├── config.js        ← isi GAS_URL di sini
    └── app.js
```

**b. Isi `GAS_URL`.** Buka `js\config.js` dengan Notepad, ganti `https://script.google.com/macros/s/GANTI_DENGAN_ID_DEPLOYMENT/exec` dengan URL `/exec` dari langkah 3.1, lalu simpan. Jangan menaruh token, kunci API, atau kata sandi di file ini.

**c. Pasang Git** (sekali saja). Windows: unduh dari `https://git-scm.com/download/win`, pasang dengan pengaturan bawaan, lalu buka **PowerShell**. Periksa dengan `git --version`.

**d. Identitas Git** (sekali saja per komputer):

```bash
git config --global user.name "Nama Anda"
git config --global user.email "email-akun-github@contoh.com"
```

**e. Buat repository di GitHub.** Buat akun di `https://github.com` bila belum punya. Tombol **+** → **New repository** → beri nama (misalnya `jastica`) → pilih **Public** (wajib untuk GitHub Pages gratis) → **jangan** centang README/.gitignore/license → **Create repository**. Repository publik aman: frontend tidak berisi rahasia apa pun, hanya alamat API.

**f. Masuk ke folder proyek dan periksa isinya.** Cara cepat: buka folder `jastica-web` di File Explorer, klik address bar, ketik `powershell`, tekan Enter. Lalu:

```powershell
dir
```

Yang harus terlihat: `index.html`, folder `css`, folder `js`. Kalau yang terlihat justru satu folder `jastica-web`, masuk dulu dengan `cd jastica-web`. Jangan lanjut sebelum `index.html` terlihat di daftar ini.

**g. Kirim ke GitHub** (satu per satu):

```bash
git init
git add .
git commit -m "Upload pertama"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```

- Ada **titik** di akhir `git add .`.
- Saat `git push` meminta *Password*, isi dengan **Personal Access Token**, bukan kata sandi akun GitHub. Buat di `https://github.com/settings/tokens` → **Generate new token (classic)** → centang **repo** → **Generate** → salin token `ghp_…` (hanya tampil sekali).
- Saat menempel token, layar terlihat kosong. Itu normal: tempel (klik kanan) lalu tekan Enter.
- Berhasil bila muncul `Writing objects: 100%` dan `* [new branch] main -> main`.
- Jangan mengunggah lewat tombol **Upload files** di situs GitHub; struktur folder `css/` dan `js/` bisa rusak.

**h. Aktifkan GitHub Pages.** Di repository: **Settings → Pages** → *Source*: **Deploy from a branch** → *Branch*: **main** dan **/ (root)** → **Save**. Centang **Enforce HTTPS** (wajib untuk kamera). Tunggu 1–2 menit sampai muncul *"Your site is live at https://USERNAME.github.io/NAMA-REPO/"*.

**i. Buka situsnya.** Halaman beranda Jastica tampil dan memuat katalog. Bila muncul layar penjelasan (misalnya "Konfigurasi belum lengkap"), ikuti langkah di layar itu atau lihat bagian 20.

**Saat frontend diubah** (misalnya mengganti `GAS_URL` atau memasang versi baru): salin file baru ke folder yang sama, lalu dari folder itu:

```bash
git add .
git commit -m "Perbarui frontend"
git push
```

GitHub Pages memperbarui situs dalam 1–2 menit. Bila masih tampil versi lama, tekan **Ctrl+Shift+R** atau buka jendela Incognito.

## 4. Langkah pertama di aplikasi

1. Buka alamat GitHub Pages Anda → **Masuk** → `superadmin` + sandi dari log → ganti sandi.
2. **Pengaturan → Identitas & rekening**: nama usaha, logo, WhatsApp usaha, rekening tujuan transfer, warna utama.
3. **Pengaturan → Jasa titip & kurir**: aturan jasa per negara (persen, minimum, atau nominal tetap), daftar kurir & ongkir, jatuh tempo tagihan, dan cara biaya jasa ditampilkan ke member (bagian 6).
4. **Manajemen User**: buat akun **Owner**, **Admin Keuangan**, dan **Staff**. Hak akses per peran bisa diatur di matriks RBAC.
5. **Katalog & Trip**: atur kota/tanggal trip, barang promo yang tampil di landing page, dan negara yang dibuka untuk member (bagian 6).
6. **Voucher & Poin**: periksa aturan poin dan buat voucher bila perlu (bagian 6 dan 7).
7. **Pengaturan → QRIS & e-wallet**: unggah QRIS usaha dan isi nomor e-wallet (GoPay, DANA, dll.) agar member bisa memilih cara bayar (bagian 7 dan 8).
8. **Pengaturan → WhatsApp & keamanan → Kunci AI Gemini** (Super Admin): agar nama barang terisi otomatis dari foto (bagian 7).
9. **Pengaturan → Template pesan** (Super Admin): sesuaikan teks WhatsApp dan email (bagian 8).
10. **Pengaturan → WhatsApp & keamanan → Verifikasi OTP untuk pengurus** (Super Admin): nyalakan setelah semua pengurus punya nomor WhatsApp atau email (bagian 8).
11. **Kalkulator Kurs**: pilih mode **Otomatis** (live) atau isi kurs **manual** per mata uang.
12. Jika sudah siap memakai data asli, hapus data contoh: di editor Apps Script jalankan **`hapusDataContoh`**. Hanya data contoh yang dihapus; data Anda tidak tersentuh.

## 5. WhatsApp (Fonnte) & OTP

OTP pendaftaran customer, OTP masuk pengurus (bila dinyalakan), kiriman invoice, dan pengingat tagihan dikirim lewat WhatsApp memakai **Fonnte**. Halaman pengaturannya hanya terlihat oleh **Super Admin**.

1. Di **fonnte.com**: menu **Device → Add device**, isi nomor WhatsApp usaha, lalu **Connect** dan pindai kode QR dari WhatsApp di HP (Perangkat tertaut). Tunggu sampai status device **connect**. Salin **token** dari baris device tersebut.
2. Di aplikasi: **Pengaturan → WhatsApp & keamanan** → tempel token → **Simpan & uji kirim**. Pesan uji dikirim ke nomor WhatsApp usaha (diisi di Identitas & rekening).
   - Notifikasi **hijau**: token tersimpan dan pesan uji diterima Fonnte.
   - Notifikasi **kuning**: token tersimpan tetapi pengiriman gagal. Alasannya ditulis di notifikasi (lihat tabel di bawah).
3. Di kotak **Status device Fonnte**, klik **Cek status**. Pastikan statusnya **Terhubung** dan sisa kuota masih ada.
   > Penyebab paling umum WhatsApp "tidak jalan": device di Fonnte **terputus**. Fonnte tetap menerima pesan dan menjawab "berhasil", tetapi pesan hanya mengantre dan tidak pernah sampai. Panel status ini menampilkan peringatan merah bila device terputus.
4. Di **Kirim pesan uji ke nomor**, isi nomor HP pribadi Anda (bukan nomor usaha) → **Kirim pesan uji**. Pastikan pesannya benar-benar masuk di HP.
5. Setelah pesan uji masuk, **matikan "Mode uji OTP"** di halaman yang sama.

> ⚠️ **Mode uji OTP aktif secara bawaan.** Selama mode ini aktif, bila WhatsApp gagal terkirim, kode OTP pendaftaran/lupa sandi ditampilkan di layar beserta alasan gagalnya, sehingga siapa pun bisa mendaftar dengan nomor apa pun. Matikan sebelum aplikasi dipakai publik. Setelah dimatikan, kode OTP hanya dikirim lewat WhatsApp; bila gagal, pendaftar melihat pesan "WhatsApp gagal terkirim" dan bisa menekan **Kirim ulang kode**. Kode OTP **masuk pengurus** tidak pernah ditampilkan di layar, termasuk dalam mode uji.

**Arti pesan gagal WhatsApp**

| Pesan di aplikasi | Yang perlu dilakukan |
|---|---|
| Token Fonnte tidak valid | Salin ulang token dari menu **Device** di fonnte.com (bukan token akun), simpan lagi. |
| Device WhatsApp di Fonnte terputus | fonnte.com → Device → **Connect**, pindai ulang kode QR. |
| Kuota atau masa aktif paket Fonnte habis | Cek kolom **Package** di fonnte.com, isi ulang atau perpanjang paket. |
| Nomor tujuan tidak valid | Periksa nomor WhatsApp customer di Customer CRM. |
| Token WhatsApp belum diisi | Tempel token di Pengaturan → WhatsApp & keamanan. |

**Kirim invoice lewat WhatsApp.** Di **Invoice & Cetak PDF** → **Kirim WhatsApp** (atau saat **Terbitkan invoice** dengan WhatsApp dicentang): sejak 1.3 invoice dikirim sebagai **gambar JPG** dengan teks template sebagai keterangan (bagian 8). Notifikasi hijau berarti terkirim; notifikasi kuning menyebut alasan gagal dari tabel di atas, atau bahwa gambar diganti teks + tautan PDF karena paket Fonnte belum mendukung kirim file. Pastikan customer punya nomor WhatsApp di Customer CRM.

| Pesan di aplikasi | Yang perlu dilakukan |
|---|---|
| Paket Fonnte belum mendukung kirim gambar (perlu paket Super/Advanced/Ultra) | Invoice tetap sampai sebagai teks + tautan PDF. Untuk mengirim gambar, naikkan paket di fonnte.com. |

Email (invoice, pengingat, dan kode OTP pengurus) dikirim lewat MailApp dari akun Google pemilik skrip, dengan tampilan berwarna merek usaha. Sisa kuota harian ditampilkan di halaman yang sama.

## 6. Biaya per pesanan, pick up, poin, voucher, dan katalog member

**Saklar biaya & pengiriman (per pesanan).** Di **Form Pesanan → Ringkasan finansial**:
- **Kenakan jasa titip**: matikan bila pesanan ini tidak dikenai jasa titip (jasa menjadi Rp 0).
- **Pengiriman: Dikirim / Pick up**. Pick up berarti customer mengambil sendiri: kurir dan ongkir dikosongkan.
- **Kenakan ongkos kirim ke customer**: matikan bila ongkir ditanggung usaha.

Member juga memilih **Dikirim kurir** atau **Ambil sendiri** saat checkout; sejak 1.2 pilihan bawaannya **Ambil sendiri**. Untuk ambil sendiri, alamat tidak wajib dan ongkir Rp 0. Invoice menulis "Pengiriman: Ambil sendiri (pick up)".

**Tampilan biaya jasa di portal member.** **Pengaturan → Jasa titip & kurir** → kartu *Tampilan biaya jasa di portal member*:
- Saklar utama **Tampilkan baris jasa titip ke member** (1.2): matikan untuk menyembunyikan jasa titip sepenuhnya (lihat bagian 7).
- Saat saklar utama menyala: centang **Tampilkan rincian persen & minimal jasa titip** untuk menampilkan teks seperti "Jasa titip (15%, min. Rp 30 rb)", atau hapus centangnya agar member hanya melihat label (misalnya "Biaya layanan") dan nominalnya. Label bisa diganti, dan pratinjaunya langsung terlihat.

**Katalog yang dibuka untuk member.** **Katalog & Trip** → kartu *Katalog yang dibuka untuk member*:
- **Semua negara**: semua katalog tampil (seperti versi sebelumnya).
- **Ikuti trip aktif**: hanya negara dari trip berstatus **Aktif** di tab Jadwal trip. Jika tidak ada trip aktif, semua negara ditampilkan.
- **Pilih manual**: centang negara yang dibuka, misalnya hanya **Jakarta** saat Owner sedang di Jakarta.

Pembatasan ini berlaku untuk katalog dan kalkulator di portal member (request barang khusus dihapus di 1.4.1), dan juga diperiksa di server. Panel admin tetap melihat semua negara.

**Poin member.** Menu **Voucher & Poin → Poin member** (Owner dan Super Admin):
- Bawaan: setiap belanja **Rp 1.000 = 1 poin**, 1 poin bernilai **Rp 1** saat ditukar, minimal **50.000 poin** terkumpul sebelum bisa ditukar. Ketiga angka dan saklar *Sistem poin aktif* bisa diubah.
- Poin masuk saat pesanan **Lunas** dan ditarik lagi bila pesanan **Batal**. Poin yang ditukar dikembalikan bila pesanan dibatalkan atau dihapus.
- Member menukar poin saat checkout, dan admin bisa menukarkannya di Form Pesanan. Saldo dan riwayat poin terlihat di halaman **Akun** member serta di profil Customer CRM.

**Voucher.** Menu **Voucher & Poin → Buat voucher**:
- Jenis **potongan nominal** (Rp) atau **diskon persen** (dengan batas maksimal potongan), plus minimal belanja opsional.
- Masa berlaku bawaan **1 bulan** sejak diterbitkan. Tanggal bisa diubah, atau pakai tombol cepat 2 minggu / 1 bulan / 3 bulan.
- Kosongkan kolom kode agar aplikasi membuat kode acak (awalan `JST`).
- Setiap voucher hanya bisa dipakai **satu kali**. Setelah dipakai, statusnya menjadi *Terpakai* dan mencatat customer serta nomor pesanannya. Voucher terpakai tidak bisa diubah atau dihapus. Gunakan saklar di tabel untuk menonaktifkan voucher yang belum dipakai.
- Voucher dilepas kembali bila pesanan dihapus atau voucher dicabut dari pesanan saat diedit. Pesanan yang dibatalkan **tidak** mengembalikan voucher.

## 7. Fitur baru versi 1.2

**Akses tamu & tema.** Pengunjung yang belum masuk tetap bisa melihat landing, katalog, jadwal trip, dan kalkulator, tetapi tombol **Titip** dan **Keranjang** baru muncul setelah member masuk. Tombol bulan/matahari di bilah atas landing dan portal member mengganti tampilan **gelap/terang**; pilihan tersimpan di perangkat itu.

**Pick up bawaan.** Di kalkulator landing dan checkout member, pilihan bawaan sekarang **Ambil sendiri (pick up) · Rp 0**. Member tetap bisa memilih kurir.

**Sembunyikan jasa titip dari member.** **Pengaturan → Jasa titip & kurir** → matikan **Tampilkan baris jasa titip ke member** → **Simpan aturan** (Super Admin & Owner).
- Baris jasa hilang dari kalkulator, katalog, keranjang, Pesanan Saya, dan invoice PDF yang diterima member.
- Harga barang yang dilihat member **sudah termasuk jasa titip**, jadi total tagihan dan pendapatan jasa **tidak berubah**. Contoh: harga Rp 1.578.000 + jasa Rp 236.700 tampil sebagai harga barang Rp 1.814.700.
- Panel admin tetap menampilkan rincian jasa di Form Pesanan, laporan, dan detail pesanan. Pratinjau invoice di **Invoice & Cetak PDF** menampilkan versi yang diterima member.

**Jenis dompet.** **Dompet & Saldo → Jenis dompet** (Super Admin & Owner): tambah jenis baru (misalnya *Bank Digital*), ganti nama, pilih ikon, atau hapus jenis. Mengganti nama jenis ikut memperbarui dompet yang memakainya. Jenis yang masih dipakai dompet tidak bisa dihapus; ubah jenis dompetnya dulu, atau cukup ganti nama jenisnya.

**QRIS pembayaran.**
1. **Pengaturan → QRIS pembayaran → Tambah QRIS** (Super Admin & Owner).
2. Pilih foto atau screenshot **QRIS statis** usaha (dari stiker merchant atau aplikasi bank/e-wallet). Aplikasi membaca kodenya dan memeriksa keasliannya; nama merchant tampil bila valid. Bila gambar tidak terbaca, tempel teks QRIS di kolom *Gambar tidak terbaca?*.
3. Simpan. Bisa menambah sampai 6 QRIS dan menyembunyikan sementara lewat saklar.

*(Dihapus di versi 1.4.1: tombol Bayar sekarang tidak lagi ada di halaman Lacak Pesanan member; lihat bagian 14.)* Di sisi member: **Pesanan Saya → Bayar sekarang → QRIS** (sejak 1.3; sebelumnya tombol *Bayar QRIS*) menampilkan QR dengan **nominal sisa tagihan otomatis** dan nama merchant. Member yang membayar dari HP yang sama bisa menekan **Simpan gambar QR**, lalu memilih gambar itu dari galeri di menu scan aplikasi bank. Setelah membayar, member menekan **Saya sudah bayar** dan mengunggah bukti (metode QRIS terisi otomatis). Verifikasi tetap di **Pembayaran & Mutasi** seperti biasa.

> QRIS di sini tidak memakai payment gateway, jadi pembayaran **tidak terkonfirmasi otomatis**. Cocokkan dengan mutasi rekening atau aplikasi merchant sebelum verifikasi. Hampir semua aplikasi bank dan e-wallet langsung mengisi nominal dari QR; bila ada aplikasi yang meminta nominal, member mengetik nominal yang tertera.

**Voucher massal.** **Voucher & Poin → Buat massal**: isi jumlah (2–500 kode), awalan opsional (misalnya `LEBARAN` → `LEBARAN-7KQ2M9`), jenis potongan, minimal belanja, masa berlaku, dan nama kampanye. Setiap kode tetap **sekali pakai**. Setelah dibuat, tekan **Salin semua kode** atau **Unduh Excel**. Ketik nama kampanye di kolom cari untuk menemukan semua kodenya.

**Tambah barang dari foto (nama otomatis).**
1. Super Admin memasang kunci AI sekali: buka **aistudio.google.com** dengan akun Google → **Get API key** → **Create API key** → salin. Di aplikasi: **Pengaturan → WhatsApp & keamanan → Kunci AI Gemini** → tempel → **Simpan & uji**. Kunci disimpan di Script Properties dan ditampilkan tersamar.
2. Di **Katalog & Trip**, tekan **Foto barang** (membuka kamera belakang di HP) atau **Unggah foto**.
3. Pop-up *Tambah barang katalog* terbuka otomatis dengan foto terpasang. Nama barang, kategori, negara, dan deskripsi terisi dari foto dalam beberapa detik. Periksa, isi **harga di toko**, lalu **Simpan**. Foto tersimpan di folder *Foto Barang* dan tampil di katalog.

Bila kunci belum dipasang atau foto tidak dikenali, pop-up tetap terbuka dengan foto terpasang dan nama diisi manual. Model Gemini dipilih otomatis (model terbaru yang tersedia untuk kunci Anda); nama model bisa diatur manual di *Pengaturan lanjutan* bila perlu.

**Tampilan.** Label **Trip Aktif** di jadwal trip dan katalog kini berwarna emas menyala bergerak seperti neon. Barang **Populer** punya label merah muda–oranye berkilau dan bingkai berpendar. Di landing page, seekor **kupu-kupu** mengikuti kursor dan hinggap di ujung kursor saat diam. Kupu-kupu hanya muncul di komputer (mouse), tidak di layar sentuh, dan otomatis mati bila perangkat diatur untuk mengurangi animasi. Di Customer CRM, nominal riwayat pesanan kini selalu satu baris di dalam kartu.

## 8. Fitur baru versi 1.3

**Keluar otomatis setelah 5 menit tanpa aktivitas.** Berlaku untuk semua pengurus dan member. Mengetik, mengetuk, menggulir, atau menggerakkan mouse dihitung sebagai aktivitas. Pada 30 detik terakhir muncul peringatan *Masih di sana?*; menyentuh layar atau menekan **Tetap masuk** membatalkannya. Setelah keluar, pengguna masuk lagi seperti biasa. Batas ini juga diperiksa server: token sesi hanya berlaku 5 menit sejak aktivitas terakhir dan diperpanjang otomatis selama pengguna aktif, sehingga sesi yang ditinggal di perangkat lain tidak bisa dipakai lagi. Umur sesi maksimal tetap 12 jam (pengurus) dan 7 hari (member).

**Satu akun satu perangkat, ditutup segera.** Bila akun yang sama masuk di perangkat lain, perangkat lama memeriksa sesi setiap 15 detik selama layarnya terbuka, lalu langsung menampilkan *Sesi berakhir karena akun ini masuk di perangkat lain* tanpa perlu diklik. Perangkat yang sedang tidur diperiksa begitu layarnya dibuka lagi.

**OTP wajib untuk pengurus (Super Admin bisa menyalakan/mematikan).**
1. Di **Manajemen User**, pastikan setiap pengurus punya **nomor WhatsApp** atau **email**, termasuk akun Super Admin sendiri. Kode lewat WhatsApp butuh token Fonnte aktif (bagian 5).
2. **Pengaturan → WhatsApp & keamanan → Verifikasi OTP untuk pengurus** → nyalakan saklar → **Aktifkan**. Aplikasi menolak menyalakannya bila akun Super Admin sendiri belum bisa menerima kode, agar Anda tidak terkunci. Daftar di bawah saklar menandai pengurus yang **belum bisa menerima kode**.
3. Mulai login berikutnya, setelah kata sandi benar, pengurus memilih **WhatsApp** atau **Email**, lalu memasukkan kode 6 digit (berlaku 5 menit, maksimal 5 percobaan, kirim ulang tiap 60 detik). Pilihan terakhir ditandai *Terakhir*. Member tidak terpengaruh.
4. **Darurat:** bila kode tidak sampai dan Super Admin terkunci, buka editor Apps Script → jalankan **`matikanOtpPengurus`** → masuk dengan kata sandi → perbaiki nomor/email atau Fonnte → nyalakan lagi.

**Masuk cepat dengan PIN (member) & Face ID/sidik jari.** *(Diganti di versi 1.3.5: member kini selalu masuk dengan nomor WhatsApp + PIN 6 digit, lihat bagian 13. Uraian di bawah hanya untuk versi lama.)*
- Setelah masuk dengan kata sandi, member melihat tawaran **Masuk lebih cepat dengan PIN** di Pesanan Saya. Bisa juga dari **Akun Saya → Masuk cepat**.
- **Menyalakan** wajib memasukkan kata sandi sekali lagi, lalu membuat PIN 6 angka (PIN mudah ditebak seperti 123456 atau 111111 ditolak). **Mematikan** cukup lewat saklar, tanpa kata sandi.
- Saat masuk berikutnya di HP itu, halaman masuk menampilkan papan angka PIN. Tersedia tombol **Masuk dengan kata sandi** dan **Bukan Anda? Hapus masuk cepat**.
- PIN berlaku per perangkat (maksimal 5 perangkat per member). Salah 5 kali → PIN di perangkat itu dicabut. Mengganti/mengatur ulang kata sandi mencabut PIN di perangkat lain. Server hanya menyimpan hash PIN dan kunci perangkat.
- **Face ID / sidik jari:** member menyimpan kata sandi di pengelola sandi HP (iCloud Keychain di iPhone, Google Password Manager di Android). Saat masuk, HP meminta Face ID atau sidik jari untuk mengisi sandi otomatis. Petunjuknya ada di kartu *Masuk cepat*. Face ID langsung dari aplikasi tidak dipakai karena aplikasi GAS berjalan di dalam bingkai halaman Google, dan browser (terutama Safari di iPhone) tidak mengizinkan Face ID/sidik jari dari bingkai seperti itu.

**Foto profil member.** **Akun Saya** → ikon kamera di avatar (atau **Tambah foto profil**) → pilih foto → pratinjau → **Gunakan foto ini**. Foto dipotong persegi dari tengah (512×512), disimpan di folder *Aset Aplikasi*, dan tampil di Akun serta menu akun di bilah atas. Foto lama dibuang saat diganti. **Hapus** mengembalikan avatar inisial.

**Bayar sekarang: transfer, QRIS, atau e-wallet.** *(Dihapus dari halaman Lacak Pesanan member di versi 1.4.1; member membayar ke rekening/e-wallet yang tertera di invoice lalu mengirim bukti lewat WhatsApp.)*
1. Admin (Super Admin & Owner, izin *Kelola QRIS pembayaran*): **Pengaturan → QRIS & e-wallet** → kartu *E-wallet untuk pembayaran member* → **Tambah e-wallet** → isi nama (GoPay, DANA, OVO, ShopeePay, …), nomor, dan atas nama di pop-up → **Simpan e-wallet**. Sejak 1.3.1 setiap e-wallet langsung tersimpan dan tampil sebagai kartu; di kartu ada saklar untuk menyembunyikan sementara, tombol ubah (pensil), dan hapus (maksimal 8 e-wallet).
2. Member: **Pesanan Saya → Bayar sekarang** membuka pilihan **Transfer** (rekening + tombol salin), **QRIS** (QR dengan nominal otomatis), dan **E-wallet** (nomor + tombol salin). Nominal sisa tagihan bisa disalin. Hanya metode yang sudah diatur admin yang muncul.
3. **Saya sudah bayar** membuka form bukti dengan metode terisi (misalnya *GoPay*); metode tetap bisa diganti. Verifikasi tetap di **Pembayaran & Mutasi**.
4. Nomor e-wallet juga tercetak di invoice dan gambar invoice. Logo merek GoPay/DANA tidak dipakai (hanya ikon dompet dan nama), sehingga tidak ada masalah hak merek.

**Template pesan WhatsApp & email (Super Admin).** **Pengaturan → Template pesan**:
- WhatsApp: *Invoice* (keterangan gambar invoice), *Pengingat tagihan*, *Kode OTP*. Email: *Invoice* (subjek + isi, PDF terlampir), *Pengingat tagihan* (subjek; isinya memakai template pengingat), *Kode OTP* (subjek + isi).
- Tekan chip seperti `{nama}`, `{noInvoice}`, `{sisa}`, `{jatuhTempo}`, `{link}` untuk menyisipkan data otomatis di posisi kursor. Format `*tebal*`, `_miring_`, `~coret~`, dan emoji didukung.
- Pratinjau langsung memakai contoh data: gelembung WhatsApp, atau email bermerek (warna utama, nama usaha, alamat & kontak di kaki email).
- Template OTP wajib memuat `{kode}`. **Kembalikan bawaan** mengembalikan teks asli aplikasi.

**Invoice JPG ke WhatsApp.** Saat admin menerbitkan atau mengirim invoice lewat WhatsApp, browser admin menggambar invoice menjadi file **JPG** (lebar 1080 px: kop merek, status, data customer, rincian barang, total, cara bayar, kontak), lalu server mengirimnya ke WhatsApp customer bersama teks template invoice.
- Kirim file lewat Fonnte membutuhkan paket **Super, Advanced, atau Ultra** (maksimal 4 MB per file). Pada paket lain, aplikasi otomatis mengirim teks + tautan PDF dan menampilkan peringatan kuning.
- Email invoice tetap melampirkan PDF.

**Tampilan.** Label negara dan **POPULER** di kartu katalog kini sejajar dan sama tinggi di HP maupun desktop (nama negara panjang dipendekkan dengan "…" hanya di layar sangat sempit). Kotak kode OTP tidak lagi melebar atau keluar dari kartu di HP. Ikon keranjang di pojok kanan atas disembunyikan di HP; keranjang tetap ada di menu bawah.

## 9. Perbaikan & peningkatan versi 1.3.1

**QRIS dan e-wallet kini pasti tersimpan.**
- **E-wallet** disimpan satu per satu lewat pop-up dan langsung muncul sebagai kartu. Di 1.3.0, baris e-wallet yang belum ditekan *Simpan e-wallet* bisa hilang saat halaman diperbarui (misalnya setelah menyimpan QRIS); sekarang tidak ada lagi isian yang tertunda.
- Bila penyimpanan QRIS atau e-wallet gagal, alasannya ditampilkan **di dalam pop-up** (tidak hanya notifikasi yang cepat hilang), dan isian tidak terhapus sehingga cukup tekan simpan lagi.
- Bila koneksi putus tepat setelah server menyimpan, aplikasi memeriksa ulang ke server lalu menampilkan *Data sudah tersimpan*, bukan pesan gagal palsu. Menekan simpan dua kali tidak membuat QRIS/e-wallet ganda.
- Sinkron latar yang dimulai sebelum Anda menyimpan tidak lagi menimpa data yang baru disimpan.

**Landing page dan panel admin lebih cepat (pola gas-scale-turbo, tanpa mengubah struktur spreadsheet).** Hasil pengukuran di simulator dengan 800 member, 6.000 pesanan, dan 12.000 baris barang (latensi server dibuat 0,5 detik):

| Ukuran | 1.3.0 | 1.3.1 |
|---|---|---|
| Buka ulang aplikasi sampai data tampil | ±2,0 detik (unduh 12,5 MB) | ±0,2 detik (cek perubahan saja) |
| Data yang diunduh saat masuk | 12,5 MB sekaligus | 6,3 MB dalam 2 tahap; data 45 hari terakhir + tagihan belum lunas tampil lebih dulu |
| Buka menu Invoice / Pengingat Tagihan | ±0,56 detik | ±0,05 detik |
| Buka menu Customer | ±0,15 detik | ±0,03 detik |
| Landing page tamu | ±0,27 detik | ±0,18 detik, tanpa panggilan server |

Yang berubah di balik layar:
- **Sinkron selisih:** setiap perubahan data dicatat ID barisnya (di cache, 6 jam). Browser hanya mengambil baris yang berubah/dihapus sejak terakhir sinkron; bila catatan sudah kedaluwarsa, browser otomatis memuat penuh.
- **Respons ringkas:** daftar data dikirim dalam format kolom + baris (nama kolom tidak diulang), ±40–50% lebih kecil. Browser lama tetap menerima format biasa.
- **Salinan lokal:** data terakhir disimpan di browser (data kecil di localStorage, data besar di IndexedDB) sehingga membuka ulang aplikasi langsung tampil, lalu hanya perubahan yang diambil. Salinan dihapus saat menekan **Keluar**.
- **Satu jalur pemantauan:** cek ringan tiap 15 detik (hanya saat layar terbuka) sekaligus memeriksa satu perangkat dan versi data; sinkron hanya berjalan bila ada perubahan.
- **Daftar panjang bertahap:** daftar Invoice dan Pengingat Tagihan menampilkan 100 baris pertama dengan tombol **Tampilkan 100 lagi**; CRM menghitung belanja per customer dengan indeks sekali jalan.
- Bacaan yang sama yang sedang berjalan dipakai bersama (tidak dobel), cache besar dipecah aman di bawah batas 100 KB per nilai, dan setiap respons server mencatat lama prosesnya (`ms`) serta versi aplikasi (`v`).

## 10. Perbaikan & peningkatan versi 1.3.2

**Total tagihan selalu sebaris.** Di invoice member (**Pesanan Saya**), ringkasan keranjang, kalkulator, dan gambar invoice JPG, setiap nominal tetap satu baris dengan labelnya dan rata kanan, dari Rp 1.000 sampai Rp 1.000.000.000. Bila angkanya terlalu panjang untuk lebar layar, huruf nominal dikecilkan sedikit. Nominal tidak lagi terpecah menjadi "Rp" di satu baris dan angkanya di baris berikutnya.

**Member bisa membatalkan pesanan.** Di **Pesanan Saya** muncul tombol **Batalkan pesanan** untuk pesanan yang masih berstatus *Baru*, belum dibayar, dan belum ada bukti bayar yang dikirim. Setelah member mengonfirmasi:
- status pesanan menjadi *Batal*;
- poin yang ditukar dikembalikan;
- voucher yang dipakai bisa digunakan lagi;
- pembatalan tercatat di **Log audit**.

Pesanan yang sudah diproses (*Dibeli*/*Dikirim*) atau sudah ada pembayarannya tetap dibatalkan oleh admin seperti biasa.

**Reset Password.** *(Versi 1.3.5: untuk nomor WhatsApp member tautan ini bertuliskan **Lupa PIN?**.)* Di halaman masuk, tautan *Lupa sandi?* diganti tombol **Reset Password** yang letaknya di bawah kotak **Kata sandi**. Alurnya sama seperti sebelumnya: kode OTP dikirim ke WhatsApp, lalu member membuat sandi baru.

**Tambah trip pasti tersimpan.**
- Tanggal trip dibaca dengan benar walau browser menampilkan kolom tanggal dalam format lain, misalnya 11/26/2026.
- Menekan **Enter** di dalam form ikut menyimpan.
- Bila penyimpanan gagal, alasannya tampil **di dalam pop-up** dan isian tidak hilang.
- Bila koneksi putus tepat setelah server menyimpan, aplikasi memeriksa ulang ke server lalu menampilkan trip yang sudah tersimpan.

**Pemisah ribuan otomatis di semua input nominal Rupiah.** Ketik `2000000`, yang tampil `2.000.000` (tanpa desimal). Berlaku di:

| Halaman | Input |
|---|---|
| Dompet & Saldo | Transfer antar dompet, saldo awal dompet |
| Pembayaran & Mutasi | Jumlah pembayaran |
| Biaya & Logistik | Jumlah pengeluaran |
| Form Pesanan | Diskon, ongkir, pembayaran awal, harga di toko (Jakarta/IDR), nilai jasa manual (Rp) |
| Voucher & Poin | Potongan (Rp), maks. potongan, minimal belanja, belanja per 1 poin |
| Pengaturan → Jasa titip & kurir | Nilai jasa (Rp per pcs / flat), minimal jasa, harga kurir |
| Katalog & Trip, Pembelian per Negara | Harga di toko untuk barang Jakarta (IDR) |
| Kalkulator Kurs | Nominal saat arah IDR → valas; harga di kalkulator jastip (IDR) |
| Portal member | Kalkulator di landing page (IDR) |

Nilai persen (misalnya jasa 7,5%) dan harga dalam mata uang asing (misalnya SGD 12,90) tetap boleh desimal. Saat tipe diganti ke persen atau negara diganti ke mata uang asing, titik pemisah otomatis dilepas.

**Jumlah Titip di katalog.** Mengisi jumlah (misalnya 10) lalu menekan **Titip** kini memasukkan 10 barang ke keranjang, baik di **Katalog** maupun di **Beranda**. Sebelumnya ada dua penyebab jumlah yang masuk hanya 1:
- barang yang sama tampil di Beranda dan Katalog, sehingga tombol membaca kotak jumlah milik kartu yang salah;
- jumlah yang sudah diisi kembali ke 1 bila daftar barang diperbarui oleh sinkron data di latar.

## 11. Fitur baru versi 1.3.3

**Harga jual katalog (Super Admin & Owner).**
1. Buka **Katalog & Trip → Barang katalog**, lalu tambah atau ubah barang.
2. Di kotak **Harga jual ke member**, isi harga jual per pcs. Contoh: harga toko Rp 15.000, dijual Rp 20.000. Di samping kotak langsung tampil harga pokok dan marginnya: hijau bila untung, merah bila di bawah harga pokok.
3. Tekan **Samakan dengan harga toko** bila tidak ingin mengambil margin. Harga jual yang sama dengan harga toko, atau yang dikosongkan, disimpan sebagai *ikut harga toko*. Untuk barang luar negeri, harganya tetap mengikuti kurs berjalan.
4. Tabel katalog di panel punya kolom **Harga jual** beserta marginnya.

Kotak dan kolom harga jual hanya tampil untuk Super Admin dan Owner. Pengurus lain yang punya akses katalog tetap bisa mengubah barang tanpa mengubah harga jualnya.

**Yang dilihat member.**
- Kartu katalog (landing page dan katalog) hanya menampilkan harga jual. Baris "Harga toko" tidak tampil lagi.
- Di keranjang, invoice di **Pesanan Saya**, PDF invoice, dan gambar invoice JPG, barang yang punya harga jual hanya menampilkan harga jual; kolom harga asli dan kurs berisi "-".
- Harga toko barang yang punya harga jual juga tidak dikirim ke browser tamu dan member.
- Jasa titip persen dihitung dari harga jual, yaitu harga yang dibayar member.

**Pesanan.** Harga jual dikunci di setiap baris pesanan saat pesanan dibuat. Mengubah harga jual di katalog hanya berlaku untuk pesanan baru; pesanan lama tetap memakai harga yang sudah disepakati. Di **Form Pesanan**, kolom *Harga beli IDR* tetap menampilkan harga pokok dengan keterangan "jual Rp …", dan **Estimasi keuntungan** kini dihitung dari margin + jasa titip − potongan. Rincian pesanan (panel samping) menampilkan baris **Margin harga jual** bila ada.

**Rincian Keuntungan di Beranda** (peran yang punya akses Laporan atau Dompet).
- KPI **Keuntungan Bulan Ini** = margin barang + jasa titip − potongan (diskon, voucher, poin). Tekan **Rincian** untuk melompat ke kartu rinciannya.
- Kartu **Rincian Keuntungan** menunjukkan alur perhitungannya:
  - Harga jual − Harga pokok = **Margin barang**
  - Margin barang + Jasa titip (− Potongan) = **Total keuntungan**
- Pilihan periode: Bulan Ini, Bulan Lalu, 30 Hari, 3 Bulan.
- Tabel per barang berisi qty, harga pokok (total dan per pcs), harga jual (total dan per pcs), margin, jasa titip, dan keuntungan, lengkap dengan baris total.
- Ongkir tidak dihitung sebagai keuntungan, dan pesanan berstatus Batal tidak dihitung.
- Grafik *Tren Penjualan & Keuntungan* tidak berubah: tetap menampilkan laba bersih (omzet − pembelian − biaya).

## 12. Fitur baru versi 1.3.4

**Foto barang dari kamera.** Fitur hapus latar & tangan otomatis dihapus di versi 1.3.5 atas permintaan. Foto kini dibuat persegi utuh tanpa terpotong dan bisa lebih dari satu (bagian 13).

**Sisa stok.**
- Form barang punya isian **Sisa stok**. Kosongkan bila tidak dibatasi (pre-order).
- Sisa stok berkurang otomatis setiap ada pesanan dan bertambah lagi bila pesanan dibatalkan. Untuk restock, isi angka stok yang baru.
- Tabel katalog panel menampilkan kolom **Stok · terjual**. Member melihat "Stok 12", "Sisa 3 lagi", atau "Stok habis".
- Jumlah titip member tidak bisa melebihi sisa stok, dan server menolak pesanan yang melebihi stok.

**Simpan nama pengguna di halaman masuk.** Centang **Simpan Username** (nama baru di 1.3.5) di bawah kotak user. Lain kali kotak user sudah terisi. Lepas centang saat masuk di perangkat bersama. Kata sandi tidak pernah disimpan.

**Ulasan barang dari member.**
- Di **Pesanan Saya**, pesanan berstatus **Selesai** menampilkan kartu **Ulas barang yang Anda terima**. Member memberi bintang 1–5, komentar, dan foto kondisi barang (opsional, bisa langsung dari kamera).
- Setiap barang yang diulas mendapat **+10 poin**, sekali per barang per pesanan. Mengubah ulasan tidak menambah poin.
- Jumlah poin diatur di **Voucher & Poin → Poin member → Poin per barang yang diulas** (isi 0 untuk mematikan). Poin tidak diberikan bila sistem poin dimatikan.
- Ulasan tampil di katalog: klik foto atau nama barang untuk membuka detail barang berisi rata-rata bintang, sebaran bintang, dan daftar ulasan. Nama member disamarkan, misalnya "Dewi S.".
- Pengelola katalog bisa menyembunyikan ulasan yang tidak pantas di **Katalog & Trip → tab Ulasan**. Poin member tidak ditarik.
- Barang request khusus (tidak ada di katalog) tidak bisa diulas.

**Katalog: rating, terjual, dan terlaris di paling atas.**
- Setiap kartu menampilkan rating bintang, jumlah ulasan, jumlah terjual, dan sisa stok.
- **TERLARIS**: 3 barang paling laris di setiap negara (minimal terjual 2) mendapat lencana berwarna yang bergerak.
- **Ulasan terbaik**: 3 barang dengan rating tertinggi (minimal 4 bintang) di setiap negara mendapat lencana emas.
- Urutan **Paling populer** menaruh barang terlaris lalu ulasan terbaik di paling atas, dikelompokkan per negara. Ada pilihan urutan baru **Terlaris** dan **Rating tertinggi**.
- Terjual dihitung dari semua pesanan yang tidak dibatalkan.

**Impor barang massal dari Excel.**
1. Buka **Katalog & Trip → Impor Excel → Unduh contoh (.xlsx)**. Kolomnya: Nama Barang, Harga di Toko, Harga Jual, Kategori. File juga berisi sheet *Petunjuk*.
2. Pilih negara asal barang. Negara menentukan mata uang Harga di Toko.
3. Unggah file .xlsx atau .csv. Pratinjau menandai setiap baris: baru, sudah ada, duplikat, atau gagal (beserta alasannya).
4. Untuk barang yang sudah ada, pilih **Lewati** atau **Perbarui harga & kategori**, lalu tekan **Impor**.

Catatan impor:
- Maksimal 500 barang per kiriman; file yang lebih besar dikirim bertahap otomatis.
- Kolom opsional yang juga dikenali: **Negara** (per baris) dan **Stok**.
- Harga Jual hanya disimpan bila diimpor oleh Super Admin atau Owner.

## 13. Fitur baru versi 1.3.5

**Halaman masuk lebih ringkas.**
- Kalimat "Customer masuk dengan nomor WhatsApp. Pengurus dengan username." dan label kotak user dihapus. Kotak user cukup berisi petunjuk *Username / No. WhatsApp*.
- Kotak centang di bawahnya kini bertuliskan **Simpan Username**.
- Saat yang diketik berupa nomor WhatsApp, kolom kedua otomatis menjadi **PIN** (papan angka di HP) dan tautan di bawahnya menjadi **Lupa PIN?**. Saat yang diketik username pengurus, kolom kedua tetap **Kata sandi** dan tautannya **Reset Password**.

**Member daftar & masuk dengan PIN 6 digit.**
- Formulir daftar meminta **PIN 6 angka** dan **Ulangi PIN** (tidak ada lagi kata sandi member). PIN yang mudah ditebak (123456, 111111, dan sejenisnya) ditolak.
- Member masuk dengan **nomor WhatsApp + PIN**. Salah 5 kali → akun dikunci 15 menit (dihitung per akun, apa pun format nomor yang diketik).
- Fitur **Masuk cepat dengan PIN** per perangkat dihapus. Ganti PIN di **Akun Saya → Ganti PIN**.
- **Lupa PIN?** → masukkan nomor WhatsApp → kode OTP → buat PIN baru. Pengurus yang punya nomor HP memakai alur yang sama, lalu memilih *Atur kata sandi baru*.
- **Member lama:**
  - Member yang dulu memakai masuk cepat cukup mengetik PIN lamanya; PIN itu langsung menjadi PIN akun.
  - Member lain masuk sekali dengan kata sandi lama, lalu muncul pop-up wajib **Buat PIN 6 angka**. Setelah itu kata sandi lama tidak berlaku lagi.
  - Atau pakai **Lupa PIN?** kapan saja.
- PIN hanya disimpan sebagai hash di sheet Users (kolom PinHash & PinSalt), tidak pernah dikirim ke browser.

**Foto profil member & pengurus yang bisa diatur.** Di **Akun Saya** (member maupun pengurus), tekan ikon kamera atau **Tambah foto profil**. Foto dibuka di editor: geser untuk mengatur posisi di dalam lingkaran, perbesar/perkecil dengan penggeser (atau cubit di HP), putar 90°, lalu **Gunakan foto ini**. Foto pengurus tampil di pojok kanan atas panel.

**Galeri foto barang (Katalog & Trip).**
- Satu barang bisa punya **sampai 6 foto**. Di form barang, tekan **Kamera** atau **Unggah** (bisa pilih beberapa foto sekaligus).
- Semua foto otomatis dibuat **persegi 1000×1000 px berlatar putih**, utuh tanpa ada sisi yang terpotong, sehingga ukuran foto di katalog seragam.
- Foto pertama = foto utama. Tombol panah memindahkan foto ke kiri (ke posisi utama), tombol tempat sampah menghapusnya.
- Di katalog member, foto bisa **digeser ke kiri/kanan** (titik penanda di pojok foto; di komputer ada panah saat kursor di atas foto). Detail barang menampilkan deretan foto kecil.
- Foto disimpan permanen di folder Drive **Foto Barang**. Foto lama (1 foto) tetap tampil; foto lama yang tidak persegi kini ditampilkan utuh, tidak terpotong.

**Chip negara & Populer/Terlaris.**
- Chip negara dan chip **Populer** / **Terlaris** sejajar, tinggi dan lebarnya sama, tulisan Proper (bukan huruf besar semua) dan tidak terpotong.
- Di HP yang sempit, ikon bendera & api disembunyikan agar tulisan tetap utuh.
- Barang **Terlaris** lalu **Populer** selalu tampil paling atas di Beranda (Katalog Pilihan) dan urutan *Paling populer* di Katalog.

**Varian warna, ukuran & berat dengan harga sendiri (Super Admin & Owner).**
- Di form barang, kotak **Varian & jasa titip** → **Tambah varian**. Isi warna, ukuran, dan/atau berat, lalu harga jual varian (contoh: Tas Hitam Rp 1.000.000, Tas Putih Rp 1.100.000).
- Harga jual kosong = sama dengan harga barang. **Harga toko** varian opsional (mata uang negara barang), dipakai untuk menghitung keuntungan.
- Member melihat "mulai Rp …" dan ringkasan pilihan (misalnya titik warna + "2 warna") di kartu katalog, lalu menekan **Pilih varian**. Di detail barang, pilihan warna/ukuran/berat berupa tombol; harga berubah sesuai varian yang dipilih.
- Keranjang, pesanan, dan invoice mencatat varian (misalnya "Putih"). Harga dihitung ulang di server. Pengurus yang membuat pesanan lewat **Impor dari katalog** melihat setiap varian sebagai baris terpisah.

**Jasa titip per barang (Super Admin & Owner).**
- Isi **Jasa titip per pcs** di kotak *Varian & jasa titip*. Kosongkan untuk mengikuti aturan jasa titip negara (Pengaturan → Jasa titip & kurir).
- Tabel **Barang katalog** punya kolom **Jasa titip** per barang.
- Kartu katalog dapat menampilkan "per pcs · jasa titip Rp …" (atau "termasuk jasa titip Rp …" bila jasa digabung ke harga). Mulai 1.4.1 baris ini bawaan disembunyikan; Super Admin & Owner menyalakannya di Pengaturan (bagian 14).

**Tabel Barang katalog lebih rapi.** Foto semua barang berukuran sama (56×56), utuh, dan teks keterangan barang sejajar di tengah. Di bawah nama tampil kategori, jumlah varian, dan jumlah foto.

## 14. Fitur baru versi 1.4.1

**Hubungi Kami: Instagram & Gabung Grup WhatsApp.** Super Admin mengisinya di **Pengaturan → Identitas & rekening → Hubungi Kami di landing page**:
- **Nama Instagram**: ketik `namausaha`, `@namausaha`, atau tempel tautan profil. Tampil di bagian Hubungi Kami dengan ikon Instagram dan membuka profil Anda.
- **Tautan grup WhatsApp**: di WhatsApp buka grup → **Info grup → Undang lewat tautan → Salin tautan**, lalu tempel (`https://chat.whatsapp.com/…`). Tampil sebagai tombol hijau **Gabung Grup WhatsApp**. Tautan lain ditolak demi keamanan.
- Kosongkan isian untuk menyembunyikan. Hanya Super Admin yang melihat dan mengubah kedua isian ini.

**Request barang di luar katalog dihapus.** Kartu *Request barang di luar katalog* di keranjang, tombol *Request barang khusus* di katalog, dan tombol *Titip barang ini* di kalkulator sudah tidak ada. Member hanya menitip barang dari katalog. Pengurus tetap bisa menambah barang di luar katalog lewat **Form Pesanan**.

**Lacak pesanan member.**
- Tab berurutan: **Semua**, **Belum Bayar** (terbuka pertama), **Dibeli**, **Dikirim**, **Selesai**. *Belum Bayar* berisi pesanan yang masih punya sisa tagihan.
- Tombol **Cetak**, **Bayar sekarang**, dan **Upload bukti bayar** dihapus. Kini ada tiga tombol sejajar dan sama lebar: **Bantuan** (WhatsApp admin berisi nomor pesanan), **Unduh Invoice**, dan **Batalkan pesanan** (selama pesanan masih *Baru* dan belum dibayar).
- **Unduh Invoice** membuka PDF invoice resmi. Bila admin belum menerbitkan invoice, rincian pesanan dibuka di jendela cetak: pilih **Simpan sebagai PDF**.
- Member membayar ke rekening/e-wallet yang tertera di invoice, lalu mengirim bukti lewat WhatsApp. Pengurus mencatatnya di **Pembayaran** seperti biasa. Kalimat petunjuk bawaan di invoice PDF, gambar invoice, dan template pesan ikut disesuaikan. Template WA/email yang pernah Anda ubah sendiri tidak diubah otomatis, jadi periksa **Pengaturan → Template** bila isinya masih menyebut menu Pesanan Saya.

**Kartu katalog.**
- Urutan isi kartu: foto → **negara** + label **Terlaris**/**Populer** (sejajar, kotak sama besar) → **nama barang** → **kategori** → terjual/rating → harga.
- Barang Terlaris lalu Populer tetap tampil paling atas.
- Baris **"per pcs · termasuk jasa titip Rp …"** kini **disembunyikan** untuk semua barang. Super Admin & Owner dapat menyalakannya di **Pengaturan → Jasa titip & kurir → Tampilkan "per pcs · jasa titip Rp …" di kartu katalog** (berlaku juga di detail barang).

**Dompet & saldo.** Tombol pensil di kartu dompet kini bisa diklik (sebelumnya tertutup lingkaran hiasan), sehingga nama, nomor, atas nama, warna, dan status dompet bisa diubah.

**Voucher: pilih satu atau pilih semua.** Di **Voucher & Poin → Voucher** ada kotak centang di setiap baris dan **Pilih semua** di atas tabel (mengikuti filter & pencarian yang aktif). Setelah memilih, tekan **Hapus terpilih**. Voucher yang sudah dipakai tidak bisa dipilih agar riwayat pesanan tetap utuh. Penghapusan massal tercatat di Audit Log.

## 15. Script Properties (Setelan proyek → Properti skrip)

Semua rahasia hanya disimpan di sini, tidak di kode, Sheets, atau browser.

| Properti | Diisi oleh | Keterangan |
|---|---|---|
| `SESSION_SECRET` | Otomatis (setup) | Kunci tanda tangan token sesi. Jangan diubah manual. |
| `SPREADSHEET_ID`, `DRIVE_ROOT_FOLDER_ID`, `FOLDER_*` | Otomatis (setup) | Lokasi database & folder. |
| `OTP_MODE_UJI` | Otomatis (`true`), diubah dari dashboard | Matikan setelah Fonnte aktif. |
| `FONNTE_TOKEN` | **Anda**, lewat Pengaturan → WhatsApp & keamanan | Ditampilkan tersamar; tidak pernah dikirim ke browser. |
| `GEMINI_API_KEY` | **Anda**, lewat Pengaturan → WhatsApp & keamanan → Kunci AI Gemini | Untuk nama barang otomatis dari foto. Ditampilkan tersamar. |
| `GEMINI_MODEL` | Opsional, lewat *Pengaturan lanjutan* | Kosongkan agar model dipilih otomatis. |
| `GEMINI_MODEL_AKTIF` | Otomatis | Model Gemini terakhir yang berhasil dipakai. Boleh dihapus; akan dipilih ulang. |
| `SKEMA_VER` | Otomatis | Versi struktur database (1.6). Dipakai untuk pembaruan otomatis. Jangan dihapus. |
| `VER_*`, `DATA_VER`, `SEQ_*`, `SAMPLE_*` | Otomatis | Versi cache, nomor urut pesanan/invoice, penanda data contoh. Jangan dihapus. |

Versi 1.3 sampai 1.3.5 tidak menambah properti yang perlu Anda isi (1.3.4 hanya menambah `FOLDER_ULASAN` yang dibuat otomatis). Saklar OTP pengurus dan template pesan disimpan di sheet **Pengaturan** (bukan rahasia); kode OTP dan PIN member hanya disimpan sebagai hash.

Siapa pun yang punya akses **edit** ke proyek Apps Script bisa melihat Script Properties, jadi jangan menambah editor sembarangan.

## 16. Fungsi pemeliharaan (jalankan dari editor)

Fungsi berikut hanya bisa dijalankan dari editor, tidak bisa dipanggil pengunjung web.

| Fungsi | Kegunaan |
|---|---|
| `resetAksesSuperAdmin` | Sandi Super Admin hilang → sandi acak baru dicetak di log, wajib diganti saat login. |
| `rotasiSecretSesi` | Keluarkan **semua** pengguna dari semua perangkat (misalnya jika curiga ada kebocoran). |
| `hapusDataContoh` | Hapus data contoh hasil setup. |
| `pasangTrigger` | Pasang ulang 3 trigger jika terhapus. |
| `matikanOtpPengurus` | Matikan OTP wajib pengurus bila kode tidak sampai dan Super Admin terkunci (bagian 8). |

## 17. Alamat aplikasi, domain sendiri & Blogger (opsional)

- Alamat aplikasi untuk member dan pengurus: `https://USERNAME.github.io/NAMA-REPO/`. Alamat `/exec` hanya untuk `GAS_URL`.
- **Domain sendiri** (misalnya `jastip.namausaha.com`): di repository → **Settings → Pages → Custom domain**, lalu ikuti petunjuk DNS dari GitHub. `GAS_URL` tidak perlu diubah.
- **Blogger:** cukup pasang tautan ke alamat GitHub Pages (disarankan). Bila tetap ingin ditanam, pakai alamat GitHub Pages (bukan `/exec`) sebagai `src` iframe:

```html
<style>.jastica-wrap{position:relative;width:100%;height:100vh;min-height:720px}
.jastica-wrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
<div class="jastica-wrap">
  <iframe src="https://USERNAME.github.io/NAMA-REPO/" allow="camera; clipboard-write" title="Jastica"></iframe>
</div>
```

## 18. Cara kerja kecepatan

- Seluruh aplikasi dimuat sekali dari GitHub Pages, dan perpindahan menu murni di browser. Data awal (katalog, kurs, pengaturan publik) diambil dari API lalu disimpan di perangkat. Kunjungan berikutnya langsung tampil dari salinan itu, lalu diperbarui diam-diam bila server punya data lebih baru.
- Semua panggilan ke server memakai satu alamat (`POST /exec`, `Content-Type: text/plain`), jadi browser tidak perlu permintaan izin CORS tambahan. Token sesi dikirim di badan permintaan, tidak pernah di URL.
- Simpan, ubah status, verifikasi bayar, dan checkout langsung tampil (optimistic). Server mengonfirmasi di belakang; jika gagal, perubahan dibatalkan otomatis dengan pemberitahuan.
- Server memakai CacheService berversi, tulis batch, dan LockService. Harga, potongan voucher, dan poin dihitung ulang di server, jadi angka dari browser tidak dipercaya begitu saja.
- Sinkronisasi hanya mengambil baris yang berubah sejak terakhir (sinkron selisih), dan buka ulang memakai salinan lokal di browser (bagian 9).
- Saat masuk, data 45 hari terakhir dan tagihan belum lunas dimuat lebih dulu; data lama menyusul di latar tanpa menahan layar.

## 19. Batasan yang perlu diketahui

- **Pengujian** dilakukan di simulator lokal (tiruan layanan GAS + Chromium), bukan di server Google asli: uji backend lulus semua dan alur E2E tanpa error, termasuk tiruan respons Fonnte (terhubung, terputus, token salah). Pada percobaan pertama di GAS, laporkan pesan error dari Log eksekusi bila ada.
- **Pembayaran** (transfer, QRIS, maupun e-wallet) diverifikasi admin dari bukti bayar. Konfirmasi otomatis lewat payment gateway tidak termasuk.
- Member masuk dengan nomor WhatsApp + PIN 6 digit (bagian 13). Pengelola sandi HP (iCloud Keychain / Google Password Manager) tetap bisa menyimpan PIN agar terisi otomatis dengan Face ID atau sidik jari.
- Varian barang memakai stok barang yang sama (sisa stok tidak dipisah per warna/ukuran).
- **Invoice JPG** dibuat di browser admin saat menekan kirim, jadi pengiriman gambar perlu dilakukan dari aplikasi (bukan dari trigger otomatis). Pengingat tagihan otomatis tetap berupa teks.
- **Nama barang dari foto** memakai Google Gemini. Hasilnya perkiraan AI, jadi periksa sebelum menyimpan. Paket gratis Gemini punya batas permintaan per menit/hari, dan menurut ketentuan Gemini API data dari paket gratis dapat dipakai Google untuk meningkatkan produknya, jadi foto barang saja (bukan dokumen pribadi). Aplikasi membatasi 60 pengenalan foto per jam per akun.
- **Kurs live** diambil dari open.er-api.com (gratis). Aplikasi memeriksanya tiap jam, tetapi sumber gratis ini biasanya memperbarui kurs sekali sehari. Gunakan mode manual bila Anda memakai kurs money changer sendiri.
- **Kuota Google**: email ±100 penerima/hari untuk akun Gmail biasa (±1.500 untuk Workspace). Kuota Fonnte mengikuti paket Anda. Volume 50–100 transaksi/hari masih jauh di bawah batas GAS.
- **Akses Web App harus "Siapa saja"**. Dengan pilihan lain (misalnya "Siapa saja yang memiliki Akun Google"), browser pelanggan diarahkan ke halaman login Google dan aplikasi menampilkan "Server belum dapat dihubungi".
- **Repository GitHub bersifat publik** (syarat GitHub Pages gratis). Isinya hanya kode tampilan dan `GAS_URL`; tidak ada data atau rahasia. Jangan pernah menaruh token atau kata sandi di repository.
- **Cache GitHub Pages**: setelah `git push`, perubahan bisa butuh 1–10 menit sampai terlihat di semua perangkat. File `css/` dan `js/` diberi nomor versi otomatis agar tidak tercampur versi lama.
- **CDN**: Bootstrap, Bootstrap Icons, flag-icons, flatpickr, Chart.js, ExcelJS, pustaka QR (qrcode-generator, jsQR), dan font Plus Jakarta Sans dimuat dari CDN publik, sehingga perangkat pengguna perlu terhubung internet.
- **Satu akun satu perangkat**: login di perangkat baru otomatis mengakhiri sesi di perangkat lama (berlaku untuk semua peran, termasuk customer). Perangkat lama yang layarnya terbuka ditutup dalam ±15 detik.
- **Salinan data di browser**: untuk buka ulang yang cepat, data terakhir disimpan di browser perangkat itu. Di komputer bersama, selalu tekan **Keluar** agar salinannya terhapus.
- **Keluar otomatis** setelah 5 menit tanpa aktivitas berlaku juga saat mengisi formulir panjang tanpa mengetik; draf Form Pesanan tetap tersimpan otomatis di perangkat.

## 20. Pemecahan masalah

**Layar penjelasan saat membuka aplikasi.** Aplikasi memeriksa dirinya sendiri dan menampilkan penyebabnya:

| Judul di layar | Penyebab | Perbaikan |
|---|---|---|
| *Konfigurasi belum lengkap* | `GAS_URL` di `js/config.js` masih contoh, salah format, atau memakai alamat `/dev` | Isi URL `/exec` (bagian 3.2 b), lalu `git add .` → `git commit -m "isi GAS_URL"` → `git push` |
| *Server belum dapat dihubungi* | Internet putus, URL `/exec` salah, atau akses Web App bukan "Siapa saja" | Periksa internet. Periksa `GAS_URL` dan pengaturan deployment (bagian 3.1) |
| *Server Apps Script masih versi lama* | `Kode` sudah diganti tetapi belum diterbitkan | **Kelola deployment → ✏️ Edit → Versi baru → Terapkan** |
| *Web App meminta login Google* | Akses deployment bukan "Siapa saja" | Ubah akses menjadi **Siapa saja**, terapkan ulang |
| *Sebagian file aplikasi tidak ditemukan* | Folder `css/` atau `js/` tidak ikut ter-upload, atau file rata di root | Pastikan isi repository sama dengan bagian 3.2 a, lalu push ulang dari folder `jastica-web` |
| *Aplikasi gagal dimuat* (dengan pesan error) | Error di skrip | Kirim tangkapan layar kotak itu ke pengembang |

**Situs GitHub Pages menampilkan "404 File not found".** Buka repository di github.com. Bila `index.html` tidak terlihat di daftar paling atas (yang terlihat justru folder seperti `jastica-web`), berarti `git init` dijalankan satu level terlalu tinggi. Masuk ke folder yang berisi `index.html`, lalu jalankan `git init`, `git add .`, `git commit -m "Perbaiki struktur"`, `git branch -M main`, `git remote add origin …`, dan `git push -u origin main --force` (perintah `--force` menimpa isi lama yang salah). Periksa juga **Settings → Pages**: branch **main**, folder **/ (root)**.

**Perubahan tidak terlihat.** Backend: URL `/exec` selalu menjalankan versi yang terakhir diterbitkan, jadi terbitkan **versi baru** lewat Kelola deployment setelah mengganti `Kode`. Frontend: pastikan `git push` berhasil, tunggu 1–2 menit, lalu tekan **Ctrl+Shift+R**.

**`git push` ditolak.** *Password authentication is not supported* → gunakan Personal Access Token (bagian 3.2 g). *Invalid username or token* → buat token baru dengan centang **repo**. *Updates were rejected because the remote contains work* → jalankan `git pull --rebase origin main` lalu `git push`.

**WhatsApp tidak sampai padahal token sudah diisi.** Buka Pengaturan → WhatsApp & keamanan → **Cek status**. Jika device terputus, sambungkan ulang di fonnte.com. Jika status terhubung, gunakan **Kirim pesan uji** ke nomor Anda sendiri dan baca alasan di notifikasi kuning (lihat tabel di bagian 5).

**QRIS atau e-wallet tidak tersimpan.** Sejak 1.3.1 alasannya tampil di dalam pop-up. *Anda tidak memiliki akses* → minta Super Admin mencentang *Kelola QRIS pembayaran* untuk peran Anda. *Server sedang sibuk* → tunggu beberapa detik lalu tekan simpan lagi. *QRIS … nominal tetap / CRC* → pakai QRIS statis dari stiker merchant. Pastikan juga sudah menerbitkan **versi baru** deployment setelah mengganti `Kode`.

**Foto barang terlihat kecil atau berbingkai putih.** Foto dibuat persegi utuh agar tidak ada sisi yang terpotong. Supaya barang tampil besar, ambil foto lebih dekat dengan barang di tengah.

**Trip tidak tersimpan.** Sejak 1.3.2 alasannya tampil di dalam pop-up trip. *Isi tanggal … yang valid* → pilih ulang tanggal dari kalender. *Anda tidak memiliki akses* → minta Super Admin mencentang izin *Kelola katalog, trip & landing* untuk peran Anda. *Server sedang sibuk* → tunggu beberapa detik lalu tekan **Simpan** lagi. Pastikan juga sudah menerbitkan **versi baru** deployment setelah mengganti `Kode`.

**Pengurus tidak bisa masuk karena kode OTP tidak sampai.** Pilih **Pakai cara lain** (email ↔ WhatsApp). Bila Super Admin sendiri terkunci, jalankan **`matikanOtpPengurus`** dari editor Apps Script, lalu periksa nomor/email di Manajemen User dan status Fonnte (bagian 5).

**Muncul "tidak bisa menerima kode" untuk seorang pengurus.** Isi nomor WhatsApp atau email akun itu di Manajemen User. Selama OTP pengurus menyala, akun tanpa keduanya tidak bisa masuk.

**Sering keluar sendiri.** Itu batas keamanan 5 menit tanpa aktivitas. Sentuh layar atau tekan **Tetap masuk** saat peringatan muncul.

**Invoice di WhatsApp berupa teks, bukan gambar.** Paket Fonnte belum mendukung kirim file (perlu Super/Advanced/Ultra). Teks tetap berisi tautan PDF invoice.

**Member lupa PIN.** Ketik nomor WhatsApp di halaman masuk, tekan **Lupa PIN?**, masukkan kode OTP dari WhatsApp, lalu buat PIN baru. Bila WhatsApp belum terpasang, Super Admin bisa menyalakan sementara *Mode uji OTP* (kode tampil di layar).

**Member lama tidak bisa masuk.** Member yang belum punya PIN masuk sekali dengan kata sandi lamanya (ketik di kolom PIN), lalu membuat PIN baru di pop-up. Di HP kolom PIN menampilkan papan angka; bila kata sandi lama berisi huruf atau sudah lupa, gunakan **Lupa PIN?**.

**Menu Voucher & Poin tidak terlihat oleh Owner.** Super Admin membuka Manajemen User → matriks hak akses, lalu mencentang *Voucher & poin member* untuk peran Owner.

**QRIS tidak terbaca saat ditambahkan.** Pakai gambar yang lebih tajam dengan QR utuh (tidak terpotong, tidak miring jauh). Bila tetap gagal, pindai QR memakai aplikasi pembaca QR biasa, salin teksnya (diawali `000201`), lalu tempel di kolom *Gambar tidak terbaca?*. Pesan "sudah berisi nominal tetap" berarti yang diunggah QRIS sekali bayar; pakai QRIS statis dari stiker atau aplikasi merchant.

**Nama barang tidak terisi otomatis dari foto.** Baca pesan kuning di pop-up:
- *Kunci AI belum dipasang*: Super Admin memasangnya di Pengaturan → WhatsApp & keamanan → Kunci AI Gemini.
- *Kunci API Gemini ditolak*: buat ulang kunci di aistudio.google.com lalu simpan lagi.
- *Kuota Gemini sedang habis*: tunggu beberapa saat, atau isi nama manual.
- *Barang di foto tidak dikenali*: foto ulang dengan kemasan/merek terlihat jelas.
