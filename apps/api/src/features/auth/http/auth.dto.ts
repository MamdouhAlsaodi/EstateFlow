import { IsString } from "class-validator";

export class AuthCredentialsDto {
  @IsString()
  accountIdentifier!: string;

  @IsString()
  password!: string;
}

export class PasswordRecoveryDto {
  @IsString()
  accountIdentifier!: string;
}

export class PasswordResetDto {
  @IsString()
  secret!: string;

  @IsString()
  password!: string;
}
