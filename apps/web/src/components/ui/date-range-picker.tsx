'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { DayPicker } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

import 'react-day-picker/dist/style.css';

interface Props {
  value: { from: Date; to: Date };
  onChange: (range: { from: Date; to: Date }) => void;
  maxDate?: Date;
}

export function DateRangePicker({ value, onChange, maxDate }: Props) {
  const [open, setOpen] = React.useState(false);

  // ✅ Make range optional to match DayPicker's "range" props without requiring `required: true`
  const [range, setRange] = React.useState<DateRange | undefined>({
    from: value.from,
    to: value.to,
  });

  React.useEffect(() => {
    if (range?.from && range?.to) onChange({ from: range.from, to: range.to });
  }, [range, onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2 text-sm font-normal">
          <CalendarIcon className="w-4 h-4" />
          {range?.from && range?.to ? (
            <>
              {format(range.from, 'dd/MM/yyyy')} – {format(range.to, 'dd/MM/yyyy')}
            </>
          ) : (
            <span>Seleccionar rango</span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="p-2 w-auto">
        <DayPicker
          mode="range"
          selected={range}
          onSelect={setRange}
          numberOfMonths={2}
          defaultMonth={range?.from}
          toDate={maxDate}
        />
      </PopoverContent>
    </Popover>
  );
}
