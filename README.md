# Thermal Printer App

This Node.js based application allows you to connect to a Bluetooth thermal printer, send text, and print QR codes. It also includes a WebSocket server for programmatic printing.

## Prerequisites

- Node.js (v14 or later recommended)
- npm (usually comes with Node.js)
- A Bluetooth-enabled thermal printer

## Installation

1. Clone this repository or download the source code:
   ```
   git clone https://github.com/yourusername/thermal-printer-app.git
   cd ws-to-thermal-bt
   ```

2. Install the dependencies:
   ```
   npm install
   ```

## Usage

To start the app:

```
node index.js
```

### WebSocket Printing

The app also runs a WebSocket server on port 8023, allowing you to send print jobs programmatically. To use this feature:

1. Connect to the WebSocket server at `ws://localhost:8023`.
2. Send a JSON message in the following format:
   ```json
   {
     "print_string": "Your text to print",
     "qr_link": "https://example.com"
   }
   ```

The app will automatically process these jobs and send them to the printer.

## Troubleshooting

- If you're having trouble connecting to the printer, make sure it's turned on and in pairing mode.
- If the app fails to start, make sure you have the latest version of Node.js installed.
