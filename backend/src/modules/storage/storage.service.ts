import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface UploadUrlResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresIn: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly config: ConfigService) {}

  async getProfilePhotoUploadUrl(userId: string, contentType: string, contentLength: number): Promise<UploadUrlResult> {
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      throw new BadRequestException(
        `File type ${contentType} is not allowed. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }
    if (contentLength > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File too large (${contentLength} bytes). Maximum size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`,
      );
    }
    if (contentLength <= 0) {
      throw new BadRequestException('Content-Length must be greater than 0');
    }

    const ext = contentType.split('/')[1];
    const key = `profile-photos/${userId}/${crypto.randomUUID()}.${ext}`;

    return this.buildUploadUrl(key, contentType);
  }

  async getActivityCoverUploadUrl(userId: string, contentType: string, contentLength: number): Promise<UploadUrlResult> {
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      throw new BadRequestException(
        `File type ${contentType} is not allowed. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }
    if (contentLength > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`);
    }
    if (contentLength <= 0) {
      throw new BadRequestException('Content-Length must be greater than 0');
    }

    const ext = contentType.split('/')[1];
    const key = `activity-covers/${userId}/${crypto.randomUUID()}.${ext}`;

    return this.buildUploadUrl(key, contentType);
  }

  private buildUploadUrl(key: string, contentType: string): UploadUrlResult {
    const bucket = this.config.get<string>('storage.aws.bucket');
    const region = this.config.get<string>('storage.aws.region') || 'ap-south-1';
    const accessKeyId = this.config.get<string>('storage.aws.accessKeyId');
    const secretAccessKey = this.config.get<string>('storage.aws.secretAccessKey');
    const expiresIn = 300; // 5 minutes

    if (!bucket || !accessKeyId || !secretAccessKey) {
      // In production, missing credentials is a hard failure — never serve a mock URL.
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'AWS S3 is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET.',
        );
      }
      // Development fallback — return a mock URL only in non-production environments.
      this.logger.warn('AWS S3 not configured — returning mock upload URL (dev only)');
      return {
        uploadUrl: `http://localhost:9000/${key}?mock=true`,
        key,
        publicUrl: `http://localhost:9000/${bucket || 'weekender-media'}/${key}`,
        expiresIn,
      };
    }

    // AWS pre-signed URL generation (manual construction to avoid adding @aws-sdk dependency)
    // In production, use: @aws-sdk/s3-request-presigner
    // This dev-safe stub returns the structure; replace with real SDK call for production.
    const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    const uploadUrl = this.generatePresignedPutUrl(bucket, region, key, contentType, accessKeyId, secretAccessKey, expiresIn);

    return { uploadUrl, key, publicUrl, expiresIn };
  }

  private generatePresignedPutUrl(
    bucket: string,
    region: string,
    key: string,
    contentType: string,
    accessKeyId: string,
    secretAccessKey: string,
    expiresIn: number,
  ): string {
    // AWS Signature V4 pre-signed URL for PUT object
    const service = 's3';
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').substring(0, 8);
    const datetimeStr = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').substring(0, 15) + 'Z';

    const credentialScope = `${dateStr}/${region}/${service}/aws4_request`;
    const credential = `${accessKeyId}/${credentialScope}`;

    const queryParams = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': datetimeStr,
      'X-Amz-Expires': String(expiresIn),
      'X-Amz-SignedHeaders': 'content-type;host',
    });

    const host = `${bucket}.s3.${region}.amazonaws.com`;
    const canonicalUri = `/${key}`;
    const canonicalQueryString = queryParams.toString();
    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
    const signedHeaders = 'content-type;host';
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [
      'PUT',
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      datetimeStr,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const hmac = (key: Buffer, data: string) =>
      crypto.createHmac('sha256', key).update(data).digest();

    const signingKey = hmac(
      hmac(hmac(hmac(Buffer.from(`AWS4${secretAccessKey}`), dateStr), region), service),
      'aws4_request',
    );

    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  }
}
