async function processContent(content, qrcodes = [], replaceChars = []) {
  // Initialize printer and set codepage
  await writeToOrig(Buffer.from('\x1B\x74\x12', 'ascii')); // ESC t 18 (CP852)
  
  const parts = content.split('{{{{{qrcode}}}}}');
  
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) {
      // Split content by lines to handle double height per line
      const lines = parts[i].split('\n');
      
      for (const line of lines) {
        // Check for double height marker
        if (line.startsWith('{dh}') && line.endsWith('{/dh}')) {
          // Enable double height
          await writeToOrig(Buffer.from('\x1D\x21\x01', 'ascii')); // GS ! n
          
          // Process the line without markers
          const textContent = line.slice(4, -5);
          const processedText = replaceSpecialChars(textContent, replaceChars);
          const encodedText = encodeSpecialChars(processedText);
          await writeToOrig(encodedText);
          await writeToOrig(Buffer.from('\n', 'ascii'));
          
          // Disable double height
          await writeToOrig(Buffer.from('\x1D\x21\x00', 'ascii')); // GS ! n
        } else {
          // Normal line processing
          const processedText = replaceSpecialChars(line, replaceChars);
          const encodedText = encodeSpecialChars(processedText);
          await writeToOrig(encodedText);
          await writeToOrig(Buffer.from('\n', 'ascii'));
        }
      }
    }
    
    if (i < qrcodes.length) {
      await generateAndPrintQR(qrcodes[i]);
    }
  }
}const WebSocket = require('ws');
const BluetoothSerialPort = require('bluetooth-serial-port');
const qrcode = require('qrcode');
const readline = require('readline');
const iconv = require('iconv-lite');

const PORT = 8032;
const btSerial = new BluetoothSerialPort.BluetoothSerialPort();
const CODEPAGE = 'cp852';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let devices = [];

// Character mapping for CP852
const charMap = {
  'č': '\x8D', 'ć': '\x8F', 'š': '\x9C', 'đ': '\xD0', 'ž': '\x9E',
  'Č': '\x8C', 'Ć': '\x8E', 'Š': '\x9B', 'Đ': '\xD1', 'Ž': '\x9D'
};

async function writeToOrig(data) {
  return new Promise((resolve, reject) => {
    btSerial.write(data, (err, bytesWritten) => {
      if (err) reject(err);
      else resolve(bytesWritten);
    });
  });
}

function encodeSpecialChars(text) {
  let result = text;
  Object.entries(charMap).forEach(([char, encoded]) => {
    result = result.replace(new RegExp(char, 'g'), encoded);
  });
  return iconv.encode(result, CODEPAGE);
}

function replaceSpecialChars(text, replaceChars = []) {
  let result = text;
  replaceChars.forEach(replacement => {
    const [from, to] = replacement.split(':');
    result = result.replace(new RegExp(from, 'g'), to);
  });
  return result;
}

async function processContent(content, qrcodes = [], replaceChars = []) {
  // Initialize printer and set codepage
  await writeToOrig(Buffer.from('\x1B\x74\x12', 'ascii')); // ESC t 18 (CP852)
  
  const parts = content.split('{{{{{qrcode}}}}}');
  
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) {
      // Extract ESC/POS commands and text content
      const commands = [];
      let textContent = parts[i].replace(/\\u001[bB][@a-zA-Z0-9]{1,2}/g, match => {
        commands.push(match);
        return '';
      });

      // Handle double height markers {dh} and {/dh}
      let isDoubleHeight = false;
      textContent = textContent.replace(/\{dh\}(.*?)\{\/dh\}/g, (match, text) => {
        isDoubleHeight = true;
        return text;
      });

      // Send commands first
      for (const cmd of commands) {
        const hexCmd = cmd.replace(/\\u001[bB]/, '\x1B');
        await writeToOrig(Buffer.from(hexCmd, 'ascii'));
      }
      
      // Set double height if needed
      if (isDoubleHeight) {
        await writeToOrig(Buffer.from('\x1B\x21\x10', 'ascii')); // ESC ! 16 (double height)
      }
      
      // Send the text content
      const processedText = replaceSpecialChars(textContent, replaceChars);
      const encodedText = encodeSpecialChars(processedText);
      await writeToOrig(encodedText);

      // Reset double height if it was set
      if (isDoubleHeight) {
        await writeToOrig(Buffer.from('\x1B\x21\x00', 'ascii')); // ESC ! 0 (normal)
      }
    }
    
    if (i < qrcodes.length) {
      await generateAndPrintQR(qrcodes[i]);
    }
  }
}

async function generateAndPrintQR({ content, size }) {
  try {
    const qrCodeMatrix = await qrcode.create(content, { errorCorrectionLevel: 'M' });
    const matrixSize = qrCodeMatrix.modules.size;
    const scale = Math.floor(size * 2 / matrixSize);
    
    const scaledSize = matrixSize * scale;
    const widthBytes = Math.ceil(scaledSize / 8);

    // GS v 0 command
    await writeToOrig(Buffer.from('\x1D\x76\x30\x00', 'ascii'));
    
    // Size parameters
    await writeToOrig(Buffer.from([
      widthBytes & 0xff, 
      (widthBytes >> 8) & 0xff, 
      scaledSize & 0xff, 
      (scaledSize >> 8) & 0xff
    ]));

    // QR code data
    for (let y = 0; y < matrixSize; y++) {
      for (let sy = 0; sy < scale; sy++) {
        let row = Buffer.alloc(widthBytes);
        for (let x = 0; x < matrixSize; x++) {
          if (qrCodeMatrix.modules.get(x, y)) {
            for (let sx = 0; sx < scale; sx++) {
              const scaledX = x * scale + sx;
              row[Math.floor(scaledX / 8)] |= (0x80 >> (scaledX % 8));
            }
          }
        }
        await writeToOrig(row);
      }
    }
  } catch (error) {
    console.error('Error generating QR code:', error);
  }
}

async function handlePrintJob(data) {
  if (data.module !== 'printer') return;
  
  const { content, qrcodes, replaceChars } = data.payload;
  await processContent(content, qrcodes, replaceChars);
}

async function findBluetoothDevices() {
  return new Promise((resolve) => {
    console.log('Searching for Bluetooth devices...');
    btSerial.on('found', (address, name) => {
      console.log(`Found device: ${name} (${address})`);
      devices.push({ name, address });
    });

    btSerial.on('finished', () => {
      console.log('Finished scanning');
      resolve();
    });

    btSerial.inquire();
  });
}

async function selectDevice() {
  return new Promise((resolve) => {
    devices.forEach((device, index) => {
      console.log(`${index + 1}: ${device.name} (${device.address})`);
    });

    rl.question('Select device number: ', (answer) => {
      const index = parseInt(answer) - 1;
      if (index >= 0 && index < devices.length) {
        resolve(devices[index]);
      } else {
        console.log('Invalid selection');
        resolve(selectDevice());
      }
    });
  });
}

async function connectToPrinter(device, retries = 5) {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        console.log(`Connection attempt ${attempt}/${retries} to ${device.name}...`);
        
        btSerial.findSerialPortChannel(device.address, (channel) => {
          btSerial.connect(device.address, channel, () => {
            console.log('Connected successfully');
            resolve();
          }, (err) => {
            console.error(`Connection failed: ${err}`);
            reject(err);
          });
        }, (err) => {
          console.error(`Failed to find channel: ${err}`);
          reject(err);
        });
      });
      
      return; // Success
    } catch (error) {
      if (attempt === retries) {
        throw new Error(`Failed to connect after ${retries} attempts`);
      }
      console.log('Retrying in 2 seconds...');
      await delay(2000);
    }
  }
}

async function main() {
  try {
    await findBluetoothDevices();
    const selectedDevice = await selectDevice();
    await connectToPrinter(selectedDevice);

    const wss = new WebSocket.Server({ port: PORT });
    console.log(`WebSocket server running on port ${PORT}`);

    wss.on('connection', (ws) => {
      console.log('Client connected');

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await handlePrintJob(data);
        } catch (error) {
          console.error('Error processing message:', error);
        }
      });

      ws.on('close', () => console.log('Client disconnected'));
    });

  } catch (error) {
    console.error('Main error:', error);
    process.exit(1);
  }
}

main();

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});