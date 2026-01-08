export type ServiceOrdersCalendarQuery = {
  start: string; // ISO
  end: string;   // ISO
  technicianId?: string; // userId o 'UNASSIGNED'
};

