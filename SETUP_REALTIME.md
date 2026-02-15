# SiliconPredict - DRAM Prediction Market with Real-Time Sync

This application now uses **Socket.io** for real-time price synchronization across multiple devices. All connected browsers see the same prices updated in real-time.

## Architecture

```
Multiple Browsers (Clients)
    ↓ (WebSocket connections)
Node.js + Socket.io Server (Central Price Management)
    ↓ (Broadcasts price updates to all clients)
All connected browsers sync simultaneously
```

## Installation & Setup

### 1. Install Dependencies

**Frontend:**

```bash
cd c:\Users\shubh\Downloads\siliconpredict-_-dram-prediction-market
npm install
```

**Backend:**

```bash
cd c:\Users\shubh\Downloads\siliconpredict-_-dram-prediction-market\server
npm install
```

### 2. Start the Backend Server (Socket.io Server)

From the `server` directory:

```bash
cd server
npm start
```

Expected output:

```
╔════════════════════════════════════════════╗
║   🚀 SiliconPredict Server Started        ║
║   📍 WebSocket: http://localhost:4000      ║
║   💼 REST API: http://localhost:4000/api   ║
╚════════════════════════════════════════════╝
```

⚠️ **Keep this terminal open!** The server must be running for the app to work.

### 3. Start the Frontend (in a new terminal)

From the root directory:

```bash
npm run dev
```

The app will open at `http://localhost:3000`

---

## How Real-Time Sync Works

### 1. **Backend Server** (`server/server.js`)

- Manages **central price state** (all prices in one place)
- **Auto-updates prices every 3 seconds** with ±2 variation
- **Broadcasts** updated prices to ALL connected clients via WebSocket
- Stores **price history** (last 100 points per ticker)

### 2. **Frontend** (`App.tsx`)

- **Connects to server** via Socket.io when the app starts
- **Listens for price updates** from the server
- Updates React state when prices change
- Dev taskbar sends manual price updates to server
- Server broadcasts those updates to **all connected users**

### 3. **Example Flow:**

```
User A changes DDR5 to $50 via dev taskbar
  ↓
Request sent to server
  ↓
Server updates central price: DDR5 = $50
  ↓
Server broadcasts to ALL clients (User A, B, C, D...)
  ↓
Everyone sees DDR5 = $50 immediately
```

---

## Testing Multiple Devices

### Open Two Browser Tabs/Windows:

**Tab 1:** `http://localhost:3000`
**Tab 2:** `http://localhost:3000`

Both will:

- ✅ Show the **same prices**
- ✅ Auto-update together every 3 seconds
- ✅ Sync manual updates instantly

### Testing with Multiple Computers:

1. **Get your computer's IP:**
   - Windows: Run `ipconfig` in CMD → look for "IPv4 Address"
   - Example: `192.168.1.100`

2. **Update the frontend `.env` file:**

   ```
   VITE_SOCKET_URL=http://192.168.1.100:4000
   ```

3. **On the other computer, visit:**
   ```
   http://192.168.1.100:3000
   ```

Both computers will now sync prices in real-time! 🎉

---

## File Structure

```
siliconpredict-_-dram-prediction-market/
├── server/
│   ├── server.js          ← Socket.io + Express server
│   └── package.json
├── components/
│   ├── MarketChart.tsx
│   ├── TickerHeader.tsx
│   └── ...
├── App.tsx                ← Socket.io client connection
├── package.json           ← Added socket.io-client
├── .env.example           ← Configuration template
└── README.md
```

---

## API Endpoints (Optional REST API)

If you prefer REST instead of WebSocket:

- **GET** `http://localhost:4000/api/prices` - Get current prices
- **POST** `http://localhost:4000/api/prices` - Update a price
- **GET** `http://localhost:4000/api/health` - Check server status

---

## Troubleshooting

| Issue                           | Solution                                  |
| ------------------------------- | ----------------------------------------- |
| "Cannot connect to server"      | Is backend running on port 4000?          |
| Prices not syncing              | Refresh browser, check console for errors |
| Different prices on each device | Backend not running or wrong IP address   |
| CORS errors                     | Update `server.js` cors origins if needed |

---

## Features

✅ **Real-time synchronization** - All users see same prices  
✅ **Automatic price updates** - Server updates every 3 seconds  
✅ **Manual price control** - Dev taskbar for testing  
✅ **Price history tracking** - Last 100 data points per ticker  
✅ **Multiple device support** - Works across LAN/Internet  
✅ **Automatic reconnection** - Client reconnects if connection drops

---

## Server Architecture Details

The backend (`server.js`) does:

1. **Maintains central state** - All 4 tickers in one place
2. **Auto-generates variations** - Prices fluctuate ±2 every 3 seconds
3. **Tracks history** - Stores price history for chart rendering
4. **Broadcasts updates** - Uses `io.emit()` to update ALL clients
5. **Accepts manual updates** - Listens for client price updates via `updatePrice` event
6. **Provides REST API** - Optional HTTP endpoints for integration

All clients receive identical data = **True Real-Time Synchronization** ✨
