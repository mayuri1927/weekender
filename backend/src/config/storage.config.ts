import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_S3_REGION || 'ap-south-1',
    bucket: process.env.AWS_S3_BUCKET || '',
  },
}));
