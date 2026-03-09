# 🦷 Vimisha's Dental Clinic — Admin Dashboard

A full-stack dental clinic management system accessible to all devices on your local network.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
```

The server will print something like:
```
🦷 Vimisha's Dental Clinic server running at http://192.168.1.5:3000
```

## Accessing from Other Devices

Any device on the **same Wi-Fi / LAN network** can open the dashboard:

1. Find your computer's local IP:
   - **Windows:** Open Command Prompt → type `ipconfig` → look for `IPv4 Address`
   - **Mac/Linux:** Open Terminal → type `ifconfig` → look for `inet` under your active adapter
2. On the other device's browser, go to: `http://<your-ip>:3000`

## Tech Stack

| Layer    | Technology        |
|----------|-------------------|
| Backend  | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| Frontend | Vanilla HTML/CSS/JS |

## Database

The SQLite database (`clinic.db`) is created automatically on first run with sample data so you can test immediately.
