/**
 * setR2Cors.js — configures CORS on the Cloudflare R2 bucket
 * so that audire-roan.vercel.app can fetch PDFs/EPUBs directly.
 * Run: node backend/setR2Cors.js
 */

import 'dotenv/config';
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
const bucketName = process.env.CLOUDFLARE_R2_BUCKET || 'audire-books';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const corsConfig = {
  CORSRules: [
    {
      AllowedOrigins: [
        'https://audire-roan.vercel.app',
        'http://localhost:5173',
        'http://localhost:3000',
      ],
      AllowedMethods: ['GET', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['Content-Length', 'Content-Type', 'ETag'],
      MaxAgeSeconds: 86400,
    },
  ],
};

async function main() {
  console.log(`\n🔧 Setting CORS on R2 bucket: ${bucketName}\n`);
  console.log('Allowed origins:');
  corsConfig.CORSRules[0].AllowedOrigins.forEach(o => console.log(`  • ${o}`));

  await r2Client.send(new PutBucketCorsCommand({
    Bucket: bucketName,
    CORSConfiguration: corsConfig,
  }));

  console.log('\n✅ CORS configured successfully!');
  console.log('   PDFs and EPUBs can now be fetched directly from R2 by the Vercel frontend.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error setting CORS:', err.message);
  process.exit(1);
});
