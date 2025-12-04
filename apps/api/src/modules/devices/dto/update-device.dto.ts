import { PartialType } from '@nestjs/mapped-types';
import { CreateDeviceDto, DeviceStatusDto } from './create-device.dto';
import { IsEnum, IsOptional, IsString } from 'class-validator';


export class UpdateDeviceDto extends PartialType(CreateDeviceDto) {
@IsOptional()
@IsEnum(DeviceStatusDto)
status?: DeviceStatusDto;


@IsOptional()
@IsString()
assetId?: string | null; // permite desvincular
}