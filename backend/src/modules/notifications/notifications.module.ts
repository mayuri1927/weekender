import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ReminderScheduler } from './reminder.scheduler';

@Module({
  providers: [NotificationsService, ReminderScheduler],
  exports: [NotificationsService],
})
export class NotificationsModule {}
