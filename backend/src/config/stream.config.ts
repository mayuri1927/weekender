import { registerAs } from '@nestjs/config';

export default registerAs('stream', () => ({
  apiKey: process.env.STREAM_API_KEY ?? '',
  apiSecret: process.env.STREAM_API_SECRET ?? '',
}));
