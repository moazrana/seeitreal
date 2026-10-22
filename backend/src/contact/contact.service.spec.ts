import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContactService } from './contact.service';

describe('ContactService', () => {
  let service: ContactService;
  let mail: { send: jest.Mock };
  let prisma: { contactEnquiry: { create: jest.Mock } };
  let env: Record<string, string | undefined>;

  const enquiry = {
    name: 'Ayesha Khan',
    email: 'ayesha@example.com',
    businessName: 'Karachi Grill',
    message: 'We would like photos taken of our whole menu, please.',
  };

  beforeEach(async () => {
    env = {
      CONTACT_RECIPIENT_EMAIL: 'owner@example.com',
      IP_HASH_SALT: 'test-salt-at-least-16-chars',
    };
    mail = { send: jest.fn().mockResolvedValue('sent') };
    prisma = {
      contactEnquiry: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactService,
        { provide: MailService, useValue: mail },
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => env[key],
            getOrThrow: (key: string) => env[key],
          },
        },
      ],
    }).compile();
    service = moduleRef.get(ContactService);
  });

  it('emails the enquiry to the configured recipient as plain text, with the sender as reply-to', async () => {
    await service.submit(enquiry, '203.0.113.7');

    expect(mail.send).toHaveBeenCalledWith({
      to: 'owner@example.com',
      subject: 'New SeeItReal enquiry from Ayesha Khan',
      text: expect.stringContaining(enquiry.message) as string,
      replyTo: 'ayesha@example.com',
    });
  });

  it('stores the enquiry with the delivery outcome and a hashed (never raw) IP', async () => {
    await service.submit(enquiry, '203.0.113.7');

    const { data } = (
      prisma.contactEnquiry.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ]
    )[0];
    expect(data).toMatchObject({ ...enquiry, emailStatus: 'sent' });
    expect(data.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(data)).not.toContain('203.0.113.7');
  });

  it('still stores the enquiry when email delivery fails, so nothing is lost', async () => {
    mail.send.mockResolvedValueOnce('failed');

    await service.submit(enquiry, '203.0.113.7');

    expect(prisma.contactEnquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emailStatus: 'failed' }) as object,
      }),
    );
  });

  it('stores as not_configured (without calling the provider) when no recipient is set', async () => {
    env.CONTACT_RECIPIENT_EMAIL = undefined;

    await service.submit(enquiry, '203.0.113.7');

    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.contactEnquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailStatus: 'not_configured',
        }) as object,
      }),
    );
  });

  it('silently discards a submission that filled the honeypot — no email, no storage', async () => {
    await service.submit(
      { ...enquiry, website: 'http://spam.example' },
      '203.0.113.7',
    );

    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.contactEnquiry.create).not.toHaveBeenCalled();
  });
});
