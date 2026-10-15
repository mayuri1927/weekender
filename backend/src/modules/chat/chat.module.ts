import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamChat } from 'stream-chat';
import { ChatService, STREAM_CHAT_CLIENT } from './chat.service';

@Module({
  providers: [
    {
      provide: STREAM_CHAT_CLIENT,
      useFactory: (config: ConfigService): StreamChat => {
        const apiKey = config.get<string>('stream.apiKey') ?? '';
        const apiSecret = config.get<string>('stream.apiSecret') ?? '';
        // Warn at boot rather than crashing; ChatService logs [TDB-006] on every call when
        // the client is misconfigured, which surfaces the issue without killing the process.
        if (!apiKey || !apiSecret) {
          // Use a minimal placeholder so NestJS wires up cleanly even in dev without keys
          return new StreamChat('missing-key', 'missing-secret');
        }
        return new StreamChat(apiKey, apiSecret);
      },
      inject: [ConfigService],
    },
    ChatService,
  ],
  exports: [ChatService],
})
export class ChatModule {}
