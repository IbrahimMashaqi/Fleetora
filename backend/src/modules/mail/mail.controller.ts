import { Controller, Get, Query } from '@nestjs/common';
import { MailService } from './mail.service.js';
@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}
}
