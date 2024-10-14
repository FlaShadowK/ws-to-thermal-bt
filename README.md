# Thermal Printer App

This Electron-based application allows you to connect to a Bluetooth thermal printer, send text, and print QR codes. It also includes a WebSocket server for programmatic printing.

## Prerequisites

- Node.js (v14 or later recommended)
- npm (usually comes with Node.js)
- A Bluetooth-enabled thermal printer

## Installation

1. Clone this repository or download the source code:
   ```
   git clone https://github.com/yourusername/thermal-printer-app.git
   cd thermal-printer-app
   ```

2. Install the dependencies:
   ```
   npm install
   ```

## Usage

To start the app:

```
npm start
```

The app window should open, displaying the user interface.

### Connecting to the Printer

1. Click the "Connect to Printer" button.
2. A Bluetooth device selection dialog will appear. Select your thermal printer from the list.
3. If the connection is successful, you'll see a "Printer connected successfully" message, and the print form will appear.

### Printing

1. Enter the text you want to print in the text area.
2. If you want to include a QR code, enter the URL in the "Enter URL for QR code" field and click "Generate QR Code". The QR code will be displayed on the screen.
3. Click the "Print" button to send the job to the printer.

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
