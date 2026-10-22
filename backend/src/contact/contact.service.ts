import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashIp } from '../common/utils/ip-hash.util';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateContactEnquiryDto } from './dto/create-contact-enquiry.dto';

/**
 * Home-page contact / photography enquiries (documents/
 * TASK-home-page-content.md §5): emailed to CONTACT_RECIPIENT_EMAIL via
 * the transactional provider, then stored with the delivery outcome. A
 * provider outage or missing configuration never loses an enquiry — it's
 * recorded as failed/not_configured and can be followed up from the DB.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async submit(
    dto: CreateContactEnquiryDto,
    ip: string | undefined,
  ): Promise<void> {
    // Honeypot tripped: pretend success so the bot learns nothing, but
    // store and send nothing.
    if (dto.website) {
      this.logger.warn(
        'Discarded a contact submission that filled the honeypot field',
      );
      return;
    }

    const recipient = this.config.get<string>('CONTACT_RECIPIENT_EMAIL');
    const emailStatus = recipient
      ? await this.mail.send({
          to: recipient,
          // Name is validated single-line (no header injection).
          subject: `New SeeItReal enquiry from ${dto.name}`,
          text: this.formatBody(dto),
          replyTo: dto.email,
        })
      : 'not_configured';

    const enquiry = await this.prisma.contactEnquiry.create({
      data: {
        name: dto.name,
        email: dto.email,
        businessName: dto.businessName || null,
        message: dto.message,
        ipHash: hashIp(ip, this.config.getOrThrow<string>('IP_HASH_SALT')),
        emailStatus,
      },
      select: { id: true },
    });
    // Id and status only — never the submitter's details or message.
    this.logger.log(
      `Contact enquiry ${enquiry.id} stored (email: ${emailStatus})`,
    );
  }

  private formatBody(dto: CreateContactEnquiryDto): string {
    return [
      'New enquiry from the SeeItReal home page',
      '',
      `Name: ${dto.name}`,
      `Email: ${dto.email}`,
      `Business: ${dto.businessName || '—'}`,
      '',
      'Message:',
      dto.message,
      '',
      '— Reply to this email to answer the sender directly.',
    ].join('\n');
  }
}
