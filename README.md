# Radio Desa — DESA TULUS (Railway)

Bot temporary voice premium untuk server **DESA TULUS**. Hosting utama menggunakan **Railway**.

## Nama project dan repository
- Nama project/folder: `Radio Desa`
- Nama repository GitHub: `Radio-Desa`
- Nama service Railway: `Radio Desa`

GitHub tidak menggunakan spasi pada URL repository, jadi nama `Radio Desa` ditulis sebagai `Radio-Desa`.

## Start Railway
Railway menjalankan:
```bash
npm start
```
Slash command dapat didaftarkan otomatis dengan `AUTO_REGISTER_COMMANDS=true`.

## Variables Railway
```env
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=1504495052217651343
AUTO_REGISTER_COMMANDS=true
DASHBOARD_ENABLED=false
PORT=3000
```
`TOKEN` tetap didukung sebagai alias `DISCORD_TOKEN`. Jangan masukkan `.env` atau token ke GitHub.

## Struktur voice
### Warga
- Category create: `═════ ➕BUAT VOICE➕ ═════`
- Panel: `〢•🎛️│ Pengaturan-Voice`
- Trigger: `🏡 │ Buat Rumah`
- Room: `🏡 │ Rumah {user}`
- Aktif: `═════ 🔊RUANG WARGA 1🔊 ═════` dan `═════ 🔊RUANG WARGA 2🔊 ═════`
- Maksimal 10 room terkelola per category.

### VIP
- Trigger: `🏯 │ Buat Villa`
- Room: `🏯 │ Villa {user}`
- Aktif: `═════ 💎RUANG VIP💎 ═════`
- Akses: Juragan, Donatur, Staff, Admin, Co Owner, dan Owner sesuai setting.

## Panel
Ganti Nama, Batas User, Kunci, Buka, Privasi, Tampil, Izinkan, Tolak, Keluarkan, Hapus.

- **Kunci:** menolak Connect untuk member umum, tetapi owner tetap bisa masuk.
- **Buka:** membuka kembali Connect untuk member umum.
- **Izinkan:** memberi target `ViewChannel`, `Connect`, dan `Speak`, termasuk saat room terkunci.
- **Tolak:** mencabut permit dan menolak akses target.

Footer: `DESA TULUS • Radio Panel`.

## Command
Slash: `/radio-help`, `/radio-status`, `/radio-setup`, `/radio-panel`, `/radio-reset`.
Alias lama `/voice-setup`, `/voice-panel`, `/voice-reset` tetap dipertahankan.

Prefix `r`: `rhelp`, `rstatus`, `rmyroom`, `rvip`, `rpanel`, `rsetup`, `rbackup`. Aktifkan **Message Content Intent**.

## VS Code
```bash
npm install
npm run check
npm run deploy
npm start
```

## Deploy Railway
1. Push project ke GitHub.
2. Railway → New Project → Deploy from GitHub Repo.
3. Isi Variables Railway.
4. Pastikan Start Command `npm start`.
5. Redeploy.

Dashboard dimatikan default dengan `DASHBOARD_ENABLED=false`. Untuk mengaktifkan health web sederhana nanti, ubah menjadi `true`.

## Data aktif
Jangan timpa atau hapus: `.env`, `config.json`, `db.json`, `voice-data.json`, `voice-state.json`, `panel-state.json`, dan folder backup/log aktif.


## Thumbnail panel khusus

Gambar kanan atas embed panel memakai file `assets/desa-tulus-panel.gif`. File dikirim sebagai attachment Discord (`attachment://desa-tulus-panel.gif`) agar GIF yang diberikan dapat digunakan langsung tanpa membuat gambar baru. Jika file hilang, bot otomatis memakai emoji DESA TULUS sebagai fallback.
