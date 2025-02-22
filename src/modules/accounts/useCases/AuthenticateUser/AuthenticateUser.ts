import { ITokensRepository } from "@modules/accounts/repositories/ITokensRepository";
import { ParametersErrors } from "core/domain/errors/ParameterErrors";
import { Either, left, right } from "core/logic/Either";
import { IMailProvider } from "infra/providers/mail/models/IMailProvider";
import { RegistrationEmailTemplate } from "infra/providers/mail/templates/RegistrationMailTemplate";
import { JWT } from "modules/accounts/domain/jwt";
import { Token } from "modules/accounts/domain/Token";
import { IUserRepository } from "modules/accounts/repositories/IUserRepository";

type TokenResponse = {
  token: string;
};

type AuthenticateUserRequest = {
  buffer: string;
};

type AuthenticateUserResponse = Either<ParametersErrors, TokenResponse>

export class AuthenticateUser {
  constructor(
    private userRepository: IUserRepository,
    private mailProvider: IMailProvider,
    private tokenRepository: ITokensRepository,
  ) { }

  async execute({ buffer }: AuthenticateUserRequest): Promise<AuthenticateUserResponse> {
    const [, hash] = buffer.split(' ')
    const [email, password] = Buffer.from(hash, 'base64').toString().split(':')

    const account = await this.userRepository.findOne(email);
    if (!account) {
      return left(new ParametersErrors('Account not exists', 404))
    }

    const isPasswordValid = await account.password.comparePassword(password);
    if (isPasswordValid === false) {
      return left(new ParametersErrors('Invalid password', 400))
    }

    // Here is called the email sending service,
    // where the email will be sent to the user to confirm.
    if (account.isVerified === false) {
      const unusedActivationTokens = await this.tokenRepository.findByTypeAndUserIdAndUsed('activation', account.id, false);

      await Promise.all(
        unusedActivationTokens.map(token => this.tokenRepository.remove(token.id))
      );

      const tokenObject = Token.create({
        type: 'activation',
        user_id: account.id,
        used: false,
      });

      account.addToken(tokenObject)
      await this.userRepository.save(account)
      await this.tokenRepository.saveSingle(tokenObject);

      await this.mailProvider.sendMail({
        to: {
          name: account.username.value,
          email: account.email.value,
        },
        from: {
          name: `${process.env.MAILER_DISPLAY_NAME}`,
          email: `${process.env.MAILER_USERNAME}`
        },
        subject: 'Ative sua conta',
        body: RegistrationEmailTemplate(account.username.value, tokenObject.id)
      })

      return left(new ParametersErrors('Account not activated', 403))
    }

    const { token } = JWT.signUser(account)
    return right({ token })
  }
}