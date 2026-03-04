import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import config from '../config/index.js';

let s3;

function getClient() {
  if (!s3) {
    s3 = new S3Client({
      region: config.r2.region,
      endpoint: config.r2.endpoint,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }
  return s3;
}

export async function uploadSnapshot(key, body, contentType = 'text/html') {
  await getClient().send(
    new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

export function buildSnapshotKey(url, timestamp) {
  const domain = new URL(url).hostname;
  const ts = timestamp || new Date().toISOString().replace(/[:.]/g, '-');
  return `snapshots/${domain}/${ts}.html`;
}
