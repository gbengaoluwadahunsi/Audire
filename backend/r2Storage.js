import 'dotenv/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
const bucketName = process.env.CLOUDFLARE_R2_BUCKET || 'audire-books';
const publicUrlBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/$/, '');

let r2Client = null;

export function isR2Configured() {
  return !!(accountId && accessKeyId && secretAccessKey);
}

function getR2Client() {
  if (!r2Client && isR2Configured()) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return r2Client;
}

/**
 * Uploads a local file to Cloudflare R2 bucket
 * @param {string} localFilePath - Path to local file on disk
 * @param {string} key - R2 destination key (e.g. books/uuid.pdf or covers/uuid.png)
 * @param {string} contentType - MIME type (e.g. application/pdf, application/epub+zip, image/jpeg)
 * @returns {Promise<string|null>} - Public R2 URL or null if R2 not configured
 */
export async function uploadToR2(localFilePath, key, contentType) {
  if (!isR2Configured()) return null;

  const client = getR2Client();
  const fileStream = fs.createReadStream(localFilePath);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
  });

  await client.send(command);

  if (publicUrlBase) {
    return `${publicUrlBase}/${key}`;
  }
  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;
}

/**
 * Uploads a Buffer directly to Cloudflare R2 bucket
 * @param {Buffer} buffer - Binary data buffer
 * @param {string} key - R2 destination key (e.g. books/uuid.pdf or covers/uuid.png)
 * @param {string} contentType - MIME type
 * @returns {Promise<string|null>} - Public R2 URL or null if R2 not configured
 */
export async function uploadBufferToR2(buffer, key, contentType) {
  if (!isR2Configured()) return null;

  const client = getR2Client();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await client.send(command);

  if (publicUrlBase) {
    return `${publicUrlBase}/${key}`;
  }
  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;
}
