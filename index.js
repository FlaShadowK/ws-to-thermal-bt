const WebSocket = require('ws');
const BluetoothSerialPort = require('bluetooth-serial-port');
const qrcode = require('qrcode');
const readline = require('readline');

const PORT = 8023;
const PRINTER_NAME = 'Mobile Printer';
const QR_SCALE = 4;

const btSerial = new BluetoothSerialPort.BluetoothSerialPort();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let devices = [];

// Character replacement map
const charReplacements = {
  'č': 'c', 'ć': 'c', 'š': 's', 'đ': 'd', 'ž': 'z',
  'Č': 'C', 'Ć': 'C', 'Š': 'S', 'Đ': 'D', 'Ž': 'Z'
};

function replaceSpecialChars(text) {
  return text.replace(/[čćšđžČĆŠĐŽ]/g, char => charReplacements[char] || char);
}

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

async function printText(text) {
  try {
    const replacedText = replaceSpecialChars(text);
    console.log('Printing text:', replacedText);
    
    // Initialize printer
    await writeToOrig(Buffer.from('\x1B\x40', 'ascii')); // ESC @
    
    // Process text for bold formatting
    const parts = replacedText.split(/(\*\*.*?\*\*)/);
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        // Bold text
        await writeToOrig(Buffer.from('\x1B\x45\x01', 'ascii')); // ESC E 1 (bold on)
        await writeToOrig(Buffer.from(part.slice(2, -2), 'ascii'));
        await writeToOrig(Buffer.from('\x1B\x45\x00', 'ascii')); // ESC E 0 (bold off)
      } else {
        // Normal text
        await writeToOrig(Buffer.from(part, 'ascii'));
      }
    }
    
    // Line feed
    await writeToOrig(Buffer.from('\x0A', 'ascii')); // LF
    console.log('Text printed successfully');
  } catch (error) {
    console.error('Error printing text:', error);
  }
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
    await printText('\n'); // Reduced paper feed after QR code
    console.log('Print job completed successfully');
  } catch (error) {
    console.error('Error processing print job:', error);
  }
}

async function testPrint() {
  const testText = "Testing special characters: čćšđž ČĆŠĐŽ\nTesting **bold** text";
  console.log('Original text:', testText);
  await printText(testText);
  await printText('\n\n'); // Add some space after test print
}

async function main() {
  try {
    await findBluetoothDevices();
    const selectedDevice = await selectDevice();
    await connectToPrinter(selectedDevice);

    // Run test print
    // await testPrint();

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