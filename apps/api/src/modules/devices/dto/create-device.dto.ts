import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';


export enum DeviceStatusDto {
ACTIVE = 'ACTIVE',
INACTIVE = 'INACTIVE',
MAINTENANCE = 'MAINTENANCE',
}


export class CreateDeviceDto {
/** Opcional: si lo pasas, debe existir ese asset */
@IsOptional()
@IsString()
assetId?: string | null;


@IsString()
@Length(2, 120)
name!: string;


@IsString()
@Length(2, 80)
code!: string;


@IsOptional()
@IsString()
model?: string;


@IsOptional()
@IsString()
manufacturer?: string;


@IsOptional()
@IsString()
description?: string;


/** Si no lo envías, se genera automáticamente */
@IsOptional()
@IsString()
ingestKey?: string;


@IsOptional()
@IsEnum(DeviceStatusDto)
status?: DeviceStatusDto;
}