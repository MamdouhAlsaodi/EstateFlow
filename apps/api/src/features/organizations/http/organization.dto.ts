import { IsIn, IsNotEmpty, IsString } from "class-validator";

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  organizationId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class CreateMembershipDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsIn(["CLIENT", "BROKER"])
  role!: "CLIENT" | "BROKER";
}

export class ApproveBrokerMembershipDto {
  @IsString()
  @IsNotEmpty()
  organizationId!: string;
}
