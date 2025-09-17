import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AssignmentRole, AssignmentState } from "@prisma/client";


export class AddAssignmentDto {
  @IsString() userId!: string; // usa IsUUID si tus IDs lo son
  @IsEnum(AssignmentRole) role!: AssignmentRole;
}

export class UpdateAssignmentDto {
  @IsEnum(AssignmentState) state!: AssignmentState;
  @IsOptional() @IsString() note?: string;
}
