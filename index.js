const WebSocket = require('ws');
const BluetoothSerialPort = require('bluetooth-serial-port');
const qrcode = require('qrcode');
const readline = require('readline');

const PORT = 8023;
const PRINTER_NAME = 'Mobile Printer';
const QR_SCALE = 4; // Increase this value to make the QR code larger

const btSerial = new BluetoothSerialPort.BluetoothSerialPort();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let devices = [];

function findBluetoothDevices() {
  return new Promise((resolve) => {
    console.log('Searching for Bluetooth devices...');
    btSerial.on('found', (address, name) => {
      console.log(`Found device: ${name} (${address})`);
      devices.push({ name, address });
    });

    btSerial.on('finished', () => {
      console.log('Finished scanning for Bluetooth devices.');
      resolve();
    });

    btSerial.inquire();
  });
}

function selectDevice() {
  return new Promise((resolve) => {
    devices.forEach((device, index) => {
      console.log(`${index + 1}: ${device.name} (${device.address})`);
    });

    rl.question('Enter the number of the device to connect to: ', (answer) => {
      const index = parseInt(answer) - 1;
      if (index >= 0 && index < devices.length) {
        resolve(devices[index]);
      } else {
        console.log('Invalid selection. Please try again.');
        resolve(selectDevice());
      }
    });
  });
}

function connectToPrinter(device) {
  return new Promise((resolve, reject) => {
    console.log(`Attempting to connect to ${device.name} (${device.address})...`);
    btSerial.findSerialPortChannel(device.address, (channel) => {
      console.log(`Found serial port channel: ${channel}`);
      btSerial.connect(device.address, channel, () => {
        console.log(`Successfully connected to ${device.name}`);
        resolve();
      }, () => {
        console.error(`Failed to connect to ${device.name}`);
        reject(new Error('Cannot connect'));
      });
    }, () => {
      console.error(`Failed to find serial port channel for ${device.name}`);
      reject(new Error('Cannot find serial port channel'));
    });
  });
}

function writeToOrig(data) {
  return new Promise((resolve, reject) => {
    btSerial.write(data, (err, bytesWritten) => {
      if (err) reject(err);
      else resolve(bytesWritten);
    });
  });
}

function printText(text) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('Printing text:', text);
      // Initialize printer
      await writeToOrig(Buffer.from('\x1B\x40', 'ascii')); // ESC @
      // Set text mode
      await writeToOrig(Buffer.from('\x1B\x21\x00', 'ascii')); // ESC ! 0
      // Print text
      await writeToOrig(Buffer.from(text, 'utf-8'));
      // Line feed
      await writeToOrig(Buffer.from('\x0A', 'ascii')); // LF
      console.log('Text printed successfully');
      resolve();
    } catch (error) {
      console.error('Error printing text:', error);
      reject(error);
    }
  });
}

async function printQRCode(url) {
  try {
    console.log('Generating QR code for URL:', url);
    const qrCodeMatrix = await qrcode.create(url, { errorCorrectionLevel: 'M' });
    const size = qrCodeMatrix.modules.size;
    const scaledSize = size * QR_SCALE;
    console.log(`QR code size: ${scaledSize}x${scaledSize}`);

    // Initialize printer
    await writeToOrig(Buffer.from('\x1B\x40', 'ascii')); // ESC @

    // Center alignment
    await writeToOrig(Buffer.from('\x1B\x61\x01', 'ascii')); // ESC a 1

    // Enter graphic mode
    await writeToOrig(Buffer.from('\x1D\x76\x30\x00', 'ascii')); // GS v 0 m

    // Set image size
    const widthBytes = Math.ceil(scaledSize / 8);
    await writeToOrig(Buffer.from([widthBytes & 0xff, (widthBytes >> 8) & 0xff, scaledSize & 0xff, (scaledSize >> 8) & 0xff]));

    // Send image data
    for (let y = 0; y < size; y++) {
      for (let sy = 0; sy < QR_SCALE; sy++) {
        let row = Buffer.alloc(widthBytes);
        for (let x = 0; x < size; x++) {
          if (qrCodeMatrix.modules.get(x, y)) {
            for (let sx = 0; sx < QR_SCALE; sx++) {
              const scaledX = x * QR_SCALE + sx;
              row[Math.floor(scaledX / 8)] |= (0x80 >> (scaledX % 8));
            }
          }
        }
        await writeToOrig(row);
      }
    }

    // Line feed
    await writeToOrig(Buffer.from('\x0A\x0A', 'ascii')); // LF LF

    // Reset alignment
    await writeToOrig(Buffer.from('\x1B\x61\x00', 'ascii')); // ESC a 0

    console.log('QR code printed successfully');
  } catch (error) {
    console.error('Error in printQRCode function:', error);
  }
}

async function handlePrintJob(data) {
  try {
    console.log('Starting print job');
    await printText(data.print_string);
    await printQRCode(data.qr_link);
    await printText('\n\n\n\n\n'); // Feed paper
    console.log('Print job completed successfully');
  } catch (error) {
    console.error('Error processing print job:', error);
  }
}

async function main() {
  try {
    await findBluetoothDevices();
    const selectedDevice = await selectDevice();
    await connectToPrinter(selectedDevice);

    const wss = new WebSocket.Server({ port: PORT });
    console.log(`WebSocket server is running on port ${PORT}`);

    wss.on('connection', (ws) => {
      console.log('New WebSocket client connected');

      ws.on('message', async (message) => {
        console.log('Received message from client:', message);
        try {
          const data = JSON.parse(message);
          console.log('Parsed data:', JSON.stringify(data, null, 2));
          await handlePrintJob(data);
        } catch (error) {
          console.error('Error processing message:', error);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });
    });
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

main();

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});