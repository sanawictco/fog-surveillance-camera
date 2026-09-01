import { Injectable } from '@nestjs/common';
import { SmsRequestDto } from './dots/sms.request.dto';
import { VoiceCallRequestDto } from './dots/voiceCall.request.dto';
import { EmailRequestDto } from './dots/email.request.dto';
import { TelegramRequestDto } from './dots/telegram.request.dto';

@Injectable()
export class MessangerService {
  constructor() {}

  async sms(body: SmsRequestDto) {
    console.log(body);
  }
  async voiceCall(body: VoiceCallRequestDto) {
    console.log(body);
  }
  async email(body: EmailRequestDto) {
    console.log(body);
  }
  async telegram(body: TelegramRequestDto) {
    console.log(body);
  }
}
