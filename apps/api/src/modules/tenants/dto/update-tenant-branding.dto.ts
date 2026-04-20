import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Max, Min } from 'class-validator';

export class UpdateTenantBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.25)
  @Max(24)
  dashboardWorkHoursPerDay?: number;

  @IsOptional()
  @IsBoolean()
  dashboardWorkMonday?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkMondayStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkMondayEndTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  dashboardWorkMondayMealBreakMinutes?: number;

  @IsOptional()
  @IsBoolean()
  dashboardWorkTuesday?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkTuesdayStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkTuesdayEndTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  dashboardWorkTuesdayMealBreakMinutes?: number;

  @IsOptional()
  @IsBoolean()
  dashboardWorkWednesday?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkWednesdayStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkWednesdayEndTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  dashboardWorkWednesdayMealBreakMinutes?: number;

  @IsOptional()
  @IsBoolean()
  dashboardWorkThursday?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkThursdayStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkThursdayEndTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  dashboardWorkThursdayMealBreakMinutes?: number;

  @IsOptional()
  @IsBoolean()
  dashboardWorkFriday?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkFridayStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkFridayEndTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  dashboardWorkFridayMealBreakMinutes?: number;

  @IsOptional()
  @IsBoolean()
  dashboardWorkSaturday?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkSaturdayStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkSaturdayEndTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  dashboardWorkSaturdayMealBreakMinutes?: number;

  @IsOptional()
  @IsBoolean()
  dashboardWorkSunday?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkSundayStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  dashboardWorkSundayEndTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  dashboardWorkSundayMealBreakMinutes?: number;

  @IsOptional()
  @IsBoolean()
  dashboardExcludeNonWorkingDates?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dashboardNonWorkingDates?: string[];
}
