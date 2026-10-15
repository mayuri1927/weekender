import { Module } from '@nestjs/common';
import { ParticipantsController } from './participants.controller';
import { ParticipantsService } from './participants.service';
import { ChatModule } from '../chat/chat.module';
import { ChatController } from '../chat/chat.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ChatModule, NotificationsModule],
  controllers: [ParticipantsController, ChatController],
  providers: [ParticipantsService],
  exports: [ParticipantsService],
})
export class ParticipantsModule {}
