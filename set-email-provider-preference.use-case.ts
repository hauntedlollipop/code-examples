import { Logger } from '@core/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';
import { MessagingProviderRepositoryInterface } from '@messaging/db/repository/messaging-provider.repository.interface';
import { SetEmailProviderPreferenceUseCaseInterface } from '@messaging/use-cases/set-email-provider-preference/set-email-provider-preference.use-case.interface';
import { SetEmailProviderPreferenceUseCaseRequestDTO } from '@messaging/use-cases/set-email-provider-preference/dto/set-email-provider-preference.use-case.request.dto';
import { SetEmailProviderPreferenceUseCaseResponseDTO } from '@messaging/use-cases/set-email-provider-preference/dto/set-email-provider-preference.use-case.response.dto';
import { EmailChannel, EmailChannelType } from '@messaging/presentation/http/dto/email-channel';
import { EmailProvider } from '@messaging/domain/email-provider';
import { EmailClientInterface } from '@messaging/infrastructure/messaging-client/email-client.interface';
import { MessagingProviderEntity } from '@messaging/db/entities/messaging-provider.entity';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { DatabaseExceptions } from '@core/db/exceptions';
import { UUID } from 'node:crypto';

@Injectable()
export class SetEmailProviderPreferenceUseCase
implements SetEmailProviderPreferenceUseCaseInterface {
  constructor(
    private readonly logger: Logger,
    @Inject(MessagingProviderRepositoryInterface)
    private readonly messagingProviderRepository: MessagingProviderRepositoryInterface,
    @Inject(EmailClientInterface)
    private readonly emailClient: EmailClientInterface,
  ) {}

  private mapPreferredChannelToProviderName(preferredChannel: EmailChannelType) {
    if (preferredChannel === EmailChannel.SELF) {
      return EmailProvider.SELF;
    }

    return this.emailClient.clientName;
  }

  private async createNewSelfProviderEntry(accountExternalId: UUID) {
    this.logger.log('Creating a default new messaging provider entry with provider SELF', { accountExternalId });
    const entity = new MessagingProviderEntity({
      grantId: null,
      accountExternalId,
      provider: EmailProvider.SELF,
      isPreferred: true,
      subProvider: null,
      metadata: {} as MessagingProviderEntity['metadata'],
    });
    entity.validate();

    try {
      await this.messagingProviderRepository.insert(entity);
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new DatabaseExceptions.UniqueConstraint(error.message, error.code!, MessagingProviderEntity, error);
      }
      throw error;
    }
  }

  async handle(request: SetEmailProviderPreferenceUseCaseRequestDTO) {
    this.logger.log('Received a request to set email channel preference', { request });

    const { accountExternalId, preferredChannel } = request;

    const entities = await this.messagingProviderRepository.findAllByAccountExternalId(accountExternalId);

    // If no entries present, create an entry with provider SELF
    // eslint-disable-next-line unicorn/prefer-ternary
    if (entities.length === 0) {
      await this.createNewSelfProviderEntry(accountExternalId);
    } else {
      await this.messagingProviderRepository.updatePreferredEmailProvider(
        this.mapPreferredChannelToProviderName(preferredChannel),
        entities,
      );
    }

    return new SetEmailProviderPreferenceUseCaseResponseDTO(accountExternalId, preferredChannel);
  }
}
