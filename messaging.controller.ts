import { EmailPreferencesHttpResponseDTO } from '@messaging/presentation/http/dto/email-preferences/email-preferences.http.request.dto';
import {
  Controller,
  Post,
  Body,
  Inject,
  Get,
  Query,
  Res,
  UseGuards,
  Req,
  HttpStatus,
  Put,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Logger } from '@core/logger/logger.service';
import { Request, Response } from 'express';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SendEmailsHttpRequestDTO } from '@messaging/presentation/http/dto/send-emails/send-emails.http.request.dto';
import { SendEmailsHttpResponseDTO } from '@messaging/presentation/http/dto/send-emails/send-emails.http.response.dto';
import { SendEmailsUseCaseInterface } from '@messaging/use-cases/send-emails/send-emails.use-case.interface';
import { AuthorizeUseCaseInterface } from '@messaging/use-cases/authorize/authorize.use-case.interface';
import { AuthorizeUseCase } from '@messaging/use-cases/authorize/authorize.use-case';
import { AuthorizeExchangeHTTPRequestDTO } from '@messaging/presentation/http/dto//authorize-exhange/authorize-exhange.http.request.dto';
import { AuthorizeHttpRequestDTO } from '@messaging/presentation/http/dto/authorize/authorize.http.request.dto';
import { AuthorizeExchangeUseCase } from '@messaging/use-cases/authorize-exchange/authorize-exchange.use-case';
import { AuthorizeExchangeUseCaseInterface } from '@messaging/use-cases/authorize-exchange/authorize-exchange.use-case.interface';
import { MessagingAPIGuard } from '@messaging/presentation/http/guards/messaging-api.guard';
import { AuthorizeHttpResponseDTO } from '@messaging/presentation/http/dto/authorize/authorize.http.response.dto';
import { AuthorizeExchangeUseCaseRequestDTO } from '@messaging/use-cases/authorize-exchange/dto/authorize-exchange.use-case.request.dto';
import { AuthorizeUseCaseRequestDTO } from '@messaging/use-cases/authorize/dto/authorize.use-case.request.dto';
import { EmailPreferencesUseCase } from '@messaging/use-cases/email-preferences/email-preferences.use-case';
import { EmailPreferencesUseCaseInterface } from '@messaging/use-cases/email-preferences/email-preferences.use-case.interface';
import { EmailPreferencesUseCaseRequestDTO } from '@messaging/use-cases/email-preferences/dto/email-preferences.use-case.request.dto';
import { SetEmailProviderPreferenceUseCaseInterface } from '@messaging/use-cases/set-email-provider-preference/set-email-provider-preference.use-case.interface';
import { SetEmailProviderPreferenceUseCaseRequestDTO } from '@messaging/use-cases/set-email-provider-preference/dto/set-email-provider-preference.use-case.request.dto';
import { SetEmailProviderHttpRequestDTO } from '@messaging/presentation/http/dto/set-email-provider-preference/set-email-provider.http.request.dto';
import { SetEmailProviderHttpResponseDTO } from '@messaging/presentation/http/dto/set-email-provider-preference/set-email-provider.http.response.dto';
import { UUID } from 'node:crypto';

@ApiTags('messaging')
@Controller({
  path: 'messaging',
  version: '1',
})
export class MessagingController {
  constructor(
    @Inject(SendEmailsUseCaseInterface)
    private readonly sendEmailsUseCase: SendEmailsUseCaseInterface,
    @Inject(AuthorizeUseCaseInterface)
    private readonly authorizeUseCase: AuthorizeUseCase,
    @Inject(AuthorizeExchangeUseCaseInterface)
    private readonly authorizeExchangeUseCase: AuthorizeExchangeUseCase,
    @Inject(EmailPreferencesUseCaseInterface)
    private readonly emailPreferencesUseCase: EmailPreferencesUseCase,
    @Inject(EmailPreferencesUseCaseInterface)
    private readonly setEmailProviderPreferenceUseCase: SetEmailProviderPreferenceUseCaseInterface,
    private readonly logger: Logger,
  ) {}

  @Post('send-emails')
  @ApiSecurity('messaging-api-authentication')
  @UseGuards(MessagingAPIGuard)
  async sendEmails(
  @Req() request: Request,
    @Body() data: SendEmailsHttpRequestDTO,
    @Res() response: Response,
  ) {
    this.logger.log('Received a request to send emails', { data });
    try {
      const result = await this.sendEmailsUseCase.handle(
        data.toSendEmailsUseCaseRequestDTO(),
      );
      return response
        .status(HttpStatus.OK)
        .send(new SendEmailsHttpResponseDTO(result));
    } catch (error: any) {
      return response
        .status(error.statusCode)
        .send({ error_message: error.message });
    }
  }

  @Get('authorize/exchange')
  async getOauthExchange(
  @Query() query: AuthorizeExchangeHTTPRequestDTO,
    @Res() response: Response,
  ) {
    this.logger.log('Received a request to exchange authorize', { query });
    const { state, code } = query;

    const results = await this.authorizeExchangeUseCase.handle(
      new AuthorizeExchangeUseCaseRequestDTO(JSON.parse(state), code),
    );

    response.redirect(results.url);
  }

  @Get('authorize')
  async getAuthLink(
  @Req() request: Request,
    @Query() query: AuthorizeHttpRequestDTO,
  ) {
    this.logger.log('Received a request to authorize email', { query });
    const { callback_url } = query;

    const result = await this.authorizeUseCase.handle(
      new AuthorizeUseCaseRequestDTO(
        callback_url,
        request.context!.user!.email!,
        request.context!.user!.username,
      ),
    );

    return new AuthorizeHttpResponseDTO(result);
  }
  @Get('email-preferences')
  async emailPreferences(@Req() request: Request) {
    this.logger.log('Received a request to get email preferences', { accountExternalId: request.context!.user!.username });

    const result = await this.emailPreferencesUseCase.handle(
      new EmailPreferencesUseCaseRequestDTO(request.context!.user!.username),
    );
    return new EmailPreferencesHttpResponseDTO(result);
  }

  @Put('email-preferences/accounts/:accountExternalId')
  async setEmailProviderPreferrence(
  @Req() request: Request,
    @Body() data: SetEmailProviderHttpRequestDTO,
    @Param('accountExternalId', ParseUUIDPipe) accountExternalId: UUID,
  ) {
    this.logger.log('Received a request set email provider preference', { accountExternalId, data });

    const result = await this.setEmailProviderPreferenceUseCase.handle(
      new SetEmailProviderPreferenceUseCaseRequestDTO(accountExternalId, data.preferred_channel),
    );
    return new SetEmailProviderHttpResponseDTO(result.accountExternalId, result.preferredChannel);
  }
}
