import { DatabaseExceptions } from '@core/db/exceptions';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { Logger } from '@core/logger/logger.service';
import {
  MessagingProviderEntity,
  MessagingProviderEntityRepository,
} from '@messaging/db/entities/messaging-provider.entity';
import { MessagingProviderRepositoryInterface } from '@messaging/db/repository/messaging-provider.repository.interface';
import { UUID } from 'node:crypto';
import { EmailProviderType } from '@messaging/domain/email-provider';

@Injectable()
export class MessagingProviderRepository
implements MessagingProviderRepositoryInterface {
  constructor(
    private readonly logger: Logger,
    private readonly entityRepository: MessagingProviderEntityRepository,
  ) {}

  async insert(entity: MessagingProviderEntity) {
    this.logger.log('Saving new record of messaging provider', { entity });
    try {
      await this.entityRepository.insert(entity);
    } catch (error: unknown) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new DatabaseExceptions.UniqueConstraint(
          error.message,
          error.code!,
          MessagingProviderEntity,
          error,
        );
      }
      throw error;
    }
    return entity;
  }

  async findByAccountExternalIdProvider(
    accountExternalId: UUID,
    provider: EmailProviderType,
  ) {
    this.logger.log('Finding an entry by external account id and provider', {
      accountExternalId,
      provider,
    });
    return this.entityRepository.findOne({ accountExternalId, provider });
  }

  async findPreferredMessagingProviderByAccountExternalId(
    accountExternalId: UUID,
  ) {
    this.logger.log('Finding account by id of messaging provider', { accountExternalId });
    const entity = await this.entityRepository.findOneOrFail({
      accountExternalId,
      isPreferred: true,
    });
    if (!entity) {
      throw new DatabaseExceptions.RecordNotFound();
    }
    return entity;
  }

  async findAllByAccountExternalId(accountExternalId: UUID) {
    this.logger.log('Finding account by id of messaging provider', { accountExternalId });
    return this.entityRepository.find({ accountExternalId });
  }

  async updatePreferredEmailProvider(
    provider: EmailProviderType,
    entities: MessagingProviderEntity[],
  ) {
    entities.forEach((entity) => {
      // eslint-disable-next-line no-param-reassign
      entity.isPreferred = entity.provider === provider;
    });

    await this.entityRepository.getEntityManager().flush();

    return entities;
  }

  async update(
    entity: MessagingProviderEntity,
    data: Partial<MessagingProviderEntity>,
  ) {
    const em = this.entityRepository.getEntityManager();

    em.assign(entity, data);

    await em.flush();

    return entity;
  }
}
