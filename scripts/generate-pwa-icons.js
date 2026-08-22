const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public', 'logo.png');
const out192 = path.join(root, 'public', 'icon-192.png');
const out512 = path.join(root, 'public', 'icon-512.png');

async function main() {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing source image: ${source}`);
  }

  await sharp(source).resize(192, 192, { fit: 'cover' }).png().toFile(out192);
  await sharp(source).resize(512, 512, { fit: 'cover' }).png().toFile(out512);

  console.log('Created:', out192);
  console.log('Created:', out512);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
