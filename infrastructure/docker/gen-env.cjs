// Generates a local-only .env with random secrets. Never commit the output.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(target)) {
  console.log('.env already exists; leaving it untouched');
  process.exit(0);
}

const secret = () => crypto.randomBytes(32).toString('hex');
const password = () => `Dev${crypto.randomBytes(6).toString('hex')}!9`;

const lines = [
  'NODE_ENV=development',
  'PORT=3000',
  'NGINX_PORT=8080',
  'POSTGRES_PASSWORD=localpassword',
  'DATABASE_URL=postgresql://hostel:localpassword@localhost:5433/hostel_management',
  'TEST_DATABASE_URL=postgresql://hostel:localpassword@localhost:5433/hostel_test',
  'REDIS_URL=redis://localhost:6380',
  `JWT_ACCESS_SECRET=${secret()}`,
  `JWT_REFRESH_SECRET=${secret()}`,
  'FRONTEND_URL=http://localhost:5173',
  'SEED_PLATFORM_ADMIN_EMAIL=platform.admin@example.test',
  `SEED_PLATFORM_ADMIN_PASSWORD=${password()}`,
  `DEMO_PASSWORD=${password()}`,
  '',
];
fs.writeFileSync(target, lines.join('\n'));
console.log('.env generated');
