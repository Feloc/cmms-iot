export type ListServiceOrdersQuery = {
  q?: string;
  status?: string | string[];
  type?: string | string[];
  technicianId?: string | string[];
  start?: string; // ISO
  end?: string;   // ISO
  page?: string | number;
  size?: string | number
  scheduledOnly?: string | number;
  unscheduledOnly?: string | number;
};
