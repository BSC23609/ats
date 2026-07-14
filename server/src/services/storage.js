import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as graph from './graph.js';

/**
 * Files (resumes, job descriptions, offer letters) live in one of three places:
 *
 *   local     — a directory on disk. Fine on your own server.
 *   s3        — any S3-compatible bucket: Cloudflare R2, AWS S3, Backblaze, MinIO.
 *   onedrive  — the group's OneDrive, through Microsoft Graph. HR can open the folder
 *               in Explorer or in the browser and see every resume filed by company.
 *
 * Object storage of some kind is essential on a platform with an ephemeral filesystem
 * (Render, Vercel), because a redeploy wipes the disk and every resume with it.
 *
 * Both drivers return and accept the same thing: an opaque key stored in the
 * database. Nothing above this file knows or cares which driver is in use.
 */
const DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
const LOCAL_DIR = process.env.UPLOAD_DIR || './uploads';
const BUCKET = process.env.S3_BUCKET;

const s3 = () =>
  new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT, // R2: https://<account>.r2.cloudflarestorage.com
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });

/** @returns {Promise<string>} the key to store on the application row */
export async function putFile(key, buffer, contentType) {
  if (DRIVER === 'onedrive') return graph.upload(key, buffer, contentType).then(() => key);
  if (DRIVER === 's3') {
    await s3().send(
      new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType })
    );
    return key;
  }
  const dest = path.join(LOCAL_DIR, key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buffer);
  return key;
}

/** @returns {Promise<Buffer>} */
export async function getFile(key) {
  if (DRIVER === 'onedrive') return graph.download(key);
  if (DRIVER === 's3') {
    const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return Buffer.from(await res.Body.transformToByteArray());
  }
  return fs.readFile(path.join(LOCAL_DIR, key));
}

export async function deleteFile(key) {
  try {
    if (DRIVER === 'onedrive') return graph.remove(key);
    if (DRIVER === 's3') {
      await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      return;
    }
    await fs.unlink(path.join(LOCAL_DIR, key));
  } catch {
    // Already gone. Deleting a file that is not there is not a failure.
  }
}

export const describeStorage = () =>
  DRIVER === 'onedrive'
    ? `onedrive (${process.env.GRAPH_DRIVE_USER}/${process.env.GRAPH_ROOT_FOLDER || 'ATS'})`
    : DRIVER === 's3'
      ? `s3 (${BUCKET})`
      : `local disk (${path.resolve(LOCAL_DIR)})`;
