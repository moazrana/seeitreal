import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { BusinessType, UserRole } from '@ar-menu/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

type MockPrisma = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  restaurant: {
    create: jest.Mock;
  };
  refreshToken: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  emailVerificationToken: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  passwordResetToken: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

function buildPrismaMock(): MockPrisma {
  const mock = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    restaurant: { create: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    emailVerificationToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  } as MockPrisma;
  // Supports both transaction forms used in AuthService: the array form
  // (verifyEmail/resetPassword) and the interactive callback form (signup,
  // which needs the newly created user's id before creating the restaurant).
  mock.$transaction = jest.fn((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: MockPrisma) => Promise<unknown>)(mock)
      : Promise.all(arg as unknown[]),
  );
  return mock;
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: MockPrisma;

  const fakeUser = {
    id: 1,
    email: 'owner@example.com',
    passwordHash: 'hashed',
    role: 'owner',
    emailVerified: false,
    failedLoginAttempts: 0,
    lockedUntil: null as Date | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const fakeRestaurant = {
    id: 5,
    ownerUserId: fakeUser.id,
    name: 'Test Diner',
    slug: 'test-diner-abcd1234',
    address: '123 Main St',
    businessType: 'restaurant',
  };

  beforeEach(async () => {
    prisma = buildPrismaMock();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                JWT_ACCESS_SECRET: 'a'.repeat(32),
                JWT_ACCESS_EXPIRES_IN: '15m',
                JWT_REFRESH_SECRET: 'b'.repeat(32),
                JWT_REFRESH_EXPIRES_IN: '7d',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('signup', () => {
    it('creates a user and returns tokens on the happy path', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValueOnce(fakeUser);
      prisma.restaurant.create.mockResolvedValueOnce(fakeRestaurant);
      prisma.emailVerificationToken.create.mockResolvedValueOnce({});
      prisma.refreshToken.create.mockResolvedValueOnce({});

      const result = await service.signup({
        email: fakeUser.email,
        password: 'Password123',
        confirmPassword: 'Password123',
        businessName: fakeRestaurant.name,
        address: fakeRestaurant.address,
      });

      expect(result.user).toEqual({
        id: fakeUser.id,
        email: fakeUser.email,
        role: UserRole.OWNER,
        emailVerified: false,
      });
      expect(result.restaurant).toEqual(fakeRestaurant);
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBe('signed.jwt.token');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: fakeUser.email }),
        }),
      );
      expect(prisma.restaurant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerUserId: fakeUser.id,
            name: fakeRestaurant.name,
            address: fakeRestaurant.address,
            businessType: BusinessType.RESTAURANT,
          }),
        }),
      );
    });

    it('rejects a duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(fakeUser);

      await expect(
        service.signup({
          email: fakeUser.email,
          password: 'Password123',
          confirmPassword: 'Password123',
          businessName: fakeRestaurant.name,
          address: fakeRestaurant.address,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('rejects an unknown email without revealing that it is unknown', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a locked account even with the correct password', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        ...fakeUser,
        lockedUntil: new Date(Date.now() + 60_000),
      });

      await expect(
        service.login({ email: fakeUser.email, password: 'whatever123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
